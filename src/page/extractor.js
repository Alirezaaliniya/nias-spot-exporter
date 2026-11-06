// ──────────────────────────────────────────────
// Injected on demand (activeTab + scripting) into panel.spotplayer.ir.
// Runs in the extension's isolated world; only READS the panel DOM and, when a
// course/section is collapsed, clicks its expand toggle to load the items.
//
// Panel structure (2025+):
//   x-grid#courses > x-gl > x-gi#i<courseId>            ← course row
//       > x-gr > x-gd#name a | x-gd#items | x-gd#exp
//       > x-ge > x-grid#items > x-gl > x-gi             ← course items (when expanded)
//   item type comes from its edit link: segment/ | media/ | text/ | exam/
// Note: ids like "name" repeat on every row, so only attribute selectors
// scoped with :scope are used.
// ──────────────────────────────────────────────
(() => {
    if (globalThis.NiasExtractor) return;

    const txt = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");

    const rowOf = (gi) => gi.querySelector(":scope > x-gr");
    const cell = (gi, id) => rowOf(gi)?.querySelector(`:scope > x-gd[id="${id}"]`) || null;
    const childItems = (list) => (list ? Array.from(list.children).filter((e) => e.localName === "x-gi") : []);
    const itemsList = (gi) => gi.querySelector(':scope > x-ge > x-grid[id="items"] > x-gl, :scope > x-ge > x-grid > x-gl');
    const idOf = (gi) => (gi.id || "").replace(/^i/, "");

    function nameOf(gi) {
        const c = cell(gi, "name");
        return c ? txt(c.querySelector("a") || c) : "";
    }

    function typeOf(gi) {
        const c = cell(gi, "name");
        const href = c?.querySelector("a")?.getAttribute("href") || "";
        const m = href.match(/(segment|media|text|exam)\/edit/);
        if (m) return m[1];
        const icon = c?.querySelector("svg[icon]")?.getAttribute("icon") || "";
        const cls = gi.className || "";
        if (/seg|sec|folder/.test(icon) || /\bseg/.test(cls)) return "segment";
        if (/txt|text/.test(icon) || /\btxt\b/.test(cls)) return "text";
        if (/exam|quiz/.test(icon) || /\bexam\b/.test(cls)) return "exam";
        return "media";
    }

    // Resolve as soon as fn() is truthy, reacting to DOM mutations instead of
    // fixed polling delays (a slow fallback tick covers non-mutation changes).
    function waitFor(fn, timeout = 10000) {
        const v = fn();
        if (v) return Promise.resolve(v);
        return new Promise((resolve) => {
            const done = () => {
                const r = fn();
                if (!r && Date.now() < end) return;
                obs.disconnect();
                clearInterval(tick);
                resolve(r);
            };
            const end = Date.now() + timeout;
            const obs = new MutationObserver(done);
            obs.observe(document.body, { childList: true, subtree: true });
            const tick = setInterval(done, 250);
        });
    }

    // Wait until no DOM mutations happened for `quiet` ms (lazy rendering finished).
    function settle(quiet = 150, max = 3000) {
        return new Promise((resolve) => {
            let t;
            const finish = () => { obs.disconnect(); clearTimeout(cap); resolve(); };
            const obs = new MutationObserver(() => { clearTimeout(t); t = setTimeout(finish, quiet); });
            obs.observe(document.body, { childList: true, subtree: true });
            t = setTimeout(finish, quiet);
            const cap = setTimeout(finish, max);
        });
    }

    // Live progress, read by the popup while extract() runs.
    let progress = { running: false, total: 0, done: 0, items: 0 };

    function clickToggle(gi) {
        const exp = cell(gi, "exp");
        if (!exp || exp.classList.contains("disabled")) return false;
        const target = exp.querySelector("svg") || exp;
        target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        return true;
    }

    // Returns the item list of a course/segment row, expanding it if needed.
    async function open(gi, opened) {
        let list = itemsList(gi);
        if (list) return list;
        if (!clickToggle(gi)) return null;
        opened.push(gi);
        list = await waitFor(() => itemsList(gi));
        if (list) await settle();
        return list;
    }

    // Expand every collapsed section of a list at once, then wait for all of
    // them together. Sections that did not open (e.g. accordion panels that
    // allow only one open row) are opened one by one later by open().
    async function openAll(segments, opened) {
        const pending = segments.filter((gi) => !itemsList(gi) && clickToggle(gi));
        if (!pending.length) return;
        opened.push(...pending);
        // first response can be slow (network); after that the rest should follow
        // quickly — if they don't, the panel probably allows one open row only.
        await waitFor(() => pending.some((gi) => itemsList(gi)), 8000);
        await waitFor(() => pending.every((gi) => itemsList(gi)), 1500);
        await settle();
        const failed = pending.filter((gi) => !itemsList(gi));
        // leave failed ones closed so open() can retry them cleanly
        for (const gi of failed) opened.splice(opened.indexOf(gi), 1);
    }

    function courseRows() {
        const grids = Array.from(document.querySelectorAll('x-grid[id="courses"]'))
            .filter((g) => !g.parentElement?.closest("x-gi"))
            .sort((a, b) => a.classList.contains("hide") - b.classList.contains("hide"));
        const seen = new Set();
        const rows = [];
        for (const g of grids) {
            for (const gi of g.querySelectorAll(":scope > x-gl > x-gi")) {
                const id = idOf(gi);
                if (id && !seen.has(id)) { seen.add(id); rows.push(gi); }
            }
        }
        return rows;
    }

    function scan() {
        const courses = courseRows().map((gi) => ({
            id: idOf(gi),
            title: nameOf(gi),
            items: parseInt(txt(cell(gi, "items")), 10) || 0,
            size: txt(cell(gi, "size")),
            expanded: !!itemsList(gi),
        }));
        return { ok: true, host: location.host, path: location.pathname, courses, licenses: licenseInfo() };
    }

    async function extract(courseId, { restore = true } = {}) {
        const gi = courseRows().find((r) => idOf(r) === courseId);
        if (!gi) return { ok: false, error: "notfound" };

        const courseTitle = nameOf(gi) || "دوره";
        const expected = parseInt(txt(cell(gi, "items")), 10) || 0;
        const opened = [];
        const chapters = [];
        let current = null;
        let walked = 0;

        const ensure = () => {
            if (!current) {
                current = { title: chapters.length ? "سایر موارد" : courseTitle, lessons: [] };
                chapters.push(current);
            }
            return current;
        };

        async function walk(list) {
            const items = childItems(list);
            const segments = items.filter((it) => typeOf(it) === "segment");
            progress.total += segments.length;
            await openAll(segments, opened);

            for (const item of items) {
                walked++;
                const type = typeOf(item);
                const title = nameOf(item);
                if (type === "segment") {
                    const parent = current;
                    current = { title: title || "بخش", lessons: [] };
                    chapters.push(current);
                    const sub = await open(item, opened);
                    progress.done++;
                    if (sub && childItems(sub).length) {
                        await walk(sub);
                        current = parent; // items after a nested section belong to the parent level
                    }
                } else if (title) {
                    ensure().lessons.push({ title, time: txt(cell(item, "time")), type });
                    progress.items++;
                }
            }
        }

        progress = { running: true, total: 0, done: 0, items: 0 };
        try {
            const list = await open(gi, opened);
            if (!list) return { ok: false, error: "empty" };
            await walk(list);
        } finally {
            progress.running = false;
            if (restore) for (const el of opened.reverse()) clickToggle(el);
        }

        const result = chapters.filter((ch) => ch.lessons.length || ch.title !== "سایر موارد");
        const lessons = result.reduce((n, ch) => n + ch.lessons.length, 0);
        return {
            ok: lessons > 0,
            error: lessons ? undefined : "empty",
            course: { id: courseId, title: courseTitle, url: location.href, chapters: result },
            stats: { lessons, walked, expected },
        };
    }

    // ───────────────────────── licenses ─────────────────────────
    //   x-grid#licenses > x-gl > x-gi.license#i<licenseId>
    //       > x-gr > x-gd#name a | #tags | #course | #device "1/3" | #download | #view
    //                | #active x-dt | #create x-dt | #action a[href*=app.spotplayer.ir]
    //       > x-ge (when expanded) > x-grid#devices, x-grid#courses
    //   x-gf > x-gp > b (total) + i[skip] page buttons, current one has class "x"

    const licenseGrid = () =>
        Array.from(document.querySelectorAll('x-grid[id="licenses"]')).find((g) => !g.parentElement?.closest("x-gi")) || null;
    const licenseRows = (grid) => (grid ? Array.from(grid.querySelectorAll(":scope > x-gl > x-gi")) : []);
    const pagerOf = (grid) => grid?.querySelector(":scope > x-gf x-gp") || null;
    const licenseTotal = (grid) => parseInt(txt(pagerOf(grid)?.querySelector("b")).replace(/\D/g, ""), 10) || licenseRows(grid).length;
    const currentSkip = (grid) => {
        const x = pagerOf(grid)?.querySelector("i.x[skip]");
        return x ? parseInt(x.getAttribute("skip"), 10) || 0 : 0;
    };

    // Smallest gap between page buttons' skip values = page size.
    function pageSize(grid) {
        const skips = Array.from(pagerOf(grid)?.querySelectorAll("i[skip]") || [])
            .map((i) => parseInt(i.getAttribute("skip"), 10))
            .filter((n) => !isNaN(n))
            .sort((a, b) => a - b);
        let size = 0;
        for (let i = 1; i < skips.length; i++) {
            const d = skips[i] - skips[i - 1];
            if (d > 0 && (!size || d < size)) size = d;
        }
        return size || licenseRows(grid).length || 100;
    }

    // "05/8/2" → "1405/8/2" (panel shows two-digit Jalali years)
    function fullDate(d) {
        const p = d.split("/");
        if (p.length === 3 && p[0].length <= 2) {
            const y = parseInt(p[0], 10);
            p[0] = String((y >= 50 ? 1300 : 1400) + y);
        }
        return p.join("/");
    }

    function dateOf(gd) {
        if (!gd) return "";
        const d = txt(gd.querySelector("x-dt-d"));
        const t = txt(gd.querySelector("x-dt-t"));
        return d ? fullDate(d) + (t ? " " + t : "") : txt(gd);
    }

    function readLicense(gi) {
        const c = (id) => cell(gi, id);
        const [used, max] = txt(c("device")).split("/").map((s) => parseInt(s, 10));
        const tags = txt(c("tags"));
        const row = {
            id: idOf(gi),
            name: nameOf(gi),
            tags: tags === "-" ? "" : tags,
            courses: parseInt(txt(c("course")), 10) || 0,
            devicesUsed: used || 0,
            devicesMax: max || 0,
            download: txt(c("download")),
            view: txt(c("view")),
            active: dateOf(c("active")),
            created: dateOf(c("create")),
            player: c("action")?.querySelector('a[href*="app.spotplayer.ir"]')?.href || "",
        };
        // details are only in the DOM when the row is expanded
        const ge = gi.querySelector(":scope > x-ge");
        if (ge) {
            row.courseNames = Array.from(ge.querySelectorAll(':scope x-grid[id="courses"] > x-gl > x-gi')).map(nameOf).filter(Boolean);
            row.devices = Array.from(ge.querySelectorAll(':scope x-grid[id="devices"] > x-gl > x-gi')).map((d) => ({
                platform: txt(cell(d, "platform")),
                ip: cell(d, "ip")?.getAttribute("title") || "",
                isp: txt(cell(d, "ip")?.querySelector("x-isp")),
                lastAccess: dateOf(cell(d, "access")),
                activated: dateOf(cell(d, "_id")),
            }));
        }
        return row;
    }

    async function gotoSkip(skip) {
        const grid = licenseGrid();
        if (currentSkip(grid) === skip) return true;
        const btn = pagerOf(grid)?.querySelector(`i[skip="${skip}"]`);
        if (!btn) return false;
        const firstId = licenseRows(grid)[0]?.id;
        btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        const ok = await waitFor(() => {
            const g = licenseGrid();
            return currentSkip(g) === skip && licenseRows(g).length && licenseRows(g)[0].id !== firstId;
        }, 20000);
        await settle();
        return !!ok;
    }

    function licenseInfo() {
        const grid = licenseGrid();
        if (!grid) return null;
        return {
            visible: !grid.classList.contains("hide"),
            total: licenseTotal(grid),
            onPage: licenseRows(grid).length,
            pageSize: pageSize(grid),
        };
    }

    async function extractLicenses({ all = false, restore = true } = {}) {
        let grid = licenseGrid();
        if (!grid) return { ok: false, error: "nogrid" };
        if (grid.classList.contains("hide")) return { ok: false, error: "hidden" };

        const rows = new Map();
        const read = () => licenseRows(licenseGrid()).forEach((gi) => {
            const r = readLicense(gi);
            if (r.id) rows.set(r.id, r);
        });

        const total = licenseTotal(grid);
        const size = pageSize(grid);
        const startSkip = currentSkip(grid);
        const pages = all ? Math.max(1, Math.ceil(total / size)) : 1;
        let partial = false;

        progress = { running: true, total: pages, done: 0, items: 0 };
        try {
            if (!all) {
                read();
                progress.done = 1;
            } else {
                for (let p = 0; p < pages; p++) {
                    if (!(await gotoSkip(p * size))) { partial = true; break; }
                    read();
                    progress.done = p + 1;
                    progress.items = rows.size;
                }
                if (restore) await gotoSkip(startSkip);
            }
        } finally {
            progress.items = rows.size;
            progress.running = false;
        }

        const list = Array.from(rows.values());
        return {
            ok: list.length > 0,
            error: list.length ? undefined : "empty",
            data: { url: location.href, extractedAt: Date.now(), total, scope: all ? "all" : "page", rows: list },
            stats: { count: list.length, total, partial },
        };
    }

    globalThis.NiasExtractor = { scan, extract, extractLicenses, licenseInfo, progress: () => ({ ...progress }) };
})();
