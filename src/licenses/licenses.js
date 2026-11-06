// ──────────────────────────────────────────────
// Licenses page: searchable/sortable table, column chooser (toggle + drag to
// reorder), and Excel / Word / PDF / JSON export of exactly what is shown.
// ──────────────────────────────────────────────

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

let data = null;
let cols = [];
let query = "";
let sort = { key: null, dir: 1 };

function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
}

function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove("show"), 2000);
}

// ── sorting keys that understand panel formats ──
const SIZE_UNITS = { B: 0, K: 1, M: 2, G: 3, T: 4 };
function sizeValue(s) {
    const m = String(s || "").match(/([\d.]+)\s*([BKMGT])/i);
    return m ? parseFloat(m[1]) * 1024 ** SIZE_UNITS[m[2].toUpperCase()] : 0;
}
function dateValue(s) {
    const m = String(s || "").match(/(\d+)\/(\d+)\/(\d+)(?:\s+(\d+):(\d+))?/);
    return m ? ((+m[1] * 100 + +m[2]) * 100 + +m[3]) * 10000 + (+m[4] || 0) * 100 + (+m[5] || 0) : 0;
}
function durationValue(s) {
    return String(s || "").split(":").reduce((a, v) => a * 60 + (parseInt(v, 10) || 0), 0);
}
function sortValue(col, r) {
    if (col.num) return Number(col.get(r)) || 0;
    if (col.key === "download") return sizeValue(r.download);
    if (col.key === "view") return durationValue(r.view);
    if (col.key === "active" || col.key === "created") return dateValue(col.get(r));
    if (col.key === "devices") return r.devicesUsed * 1000 + r.devicesMax;
    return String(col.get(r) || "");
}

function visibleRows() {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    let rows = data.rows;
    if (q) {
        rows = rows.filter((r) =>
            [r.name, r.tags, r.id, r.player, (r.courseNames || []).join(" "), r.active, r.created].join(" ").toLowerCase().includes(q)
        );
    }
    if (sort.key) {
        const col = columnByKey(sort.key);
        rows = rows
            .map((r) => [sortValue(col, r), r])
            .sort((a, b) => (typeof a[0] === "string" ? a[0].localeCompare(b[0], "fa") : a[0] - b[0]) * sort.dir)
            .map((x) => x[1]);
    }
    return rows;
}

// ───────────────────────── table ─────────────────────────
function renderTable() {
    const columns = activeColumns(cols);
    const rows = visibleRows();

    const tr = el("tr");
    tr.append(el("th", "", "#"));
    for (const c of columns) {
        const th = el("th", sort.key === c.key ? "sorted" : "", c.label);
        th.dataset.key = c.key;
        th.append(el("span", "s", sort.key === c.key ? (sort.dir > 0 ? "▲" : "▼") : "↕"));
        tr.append(th);
    }
    $("#grid thead").replaceChildren(tr);

    const frag = document.createDocumentFragment();
    rows.forEach((r, i) => {
        const row = el("tr");
        row.append(el("td", "n", String(i + 1)));
        for (const c of columns) {
            const td = el("td");
            const v = c.get(r);
            if (c.key === "player" && v) {
                const a = el("a", "", "باز کردن");
                a.href = v;
                a.target = "_blank";
                a.rel = "noopener noreferrer";
                td.append(a);
            } else {
                td.textContent = v ?? "";
                td.title = v ?? "";
            }
            row.append(td);
        }
        frag.append(row);
    });
    $("#grid tbody").replaceChildren(frag);

    const total = data?.rows.length || 0;
    $("#countPill").textContent = total.toLocaleString("fa-IR");
    $("#foot").textContent = query ? `${rows.length.toLocaleString("fa-IR")} از ${total.toLocaleString("fa-IR")} لایسنس` : `${total.toLocaleString("fa-IR")} لایسنس`;
}

$("#grid thead").addEventListener("click", (e) => {
    const th = e.target.closest("th[data-key]");
    if (!th) return;
    const k = th.dataset.key;
    sort = sort.key === k ? (sort.dir > 0 ? { key: k, dir: -1 } : { key: null, dir: 1 }) : { key: k, dir: 1 };
    renderTable();
});

let searchTimer = null;
$("#search").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        query = e.target.value;
        renderTable();
    }, 120);
});

// ───────────────────────── column chooser ─────────────────────────
let colsTimer = null;
function saveCols() {
    clearTimeout(colsTimer);
    colsTimer = setTimeout(() => chrome.storage.sync.set({ [LICENSE_COLS_KEY]: cols }), 400);
}

function renderCols() {
    const hasDetails = data?.rows.some((r) => r.courseNames);
    const ul = $("#cols");
    ul.replaceChildren(
        ...cols.map((c) => {
            const def = columnByKey(c.key);
            const li = el("li", c.on ? "" : "off");
            li.draggable = true;
            li.dataset.key = c.key;
            const label = el("label");
            const cb = el("input");
            cb.type = "checkbox";
            cb.checked = c.on;
            cb.addEventListener("change", () => {
                c.on = cb.checked;
                if (!cols.some((x) => x.on)) { c.on = true; cb.checked = true; return toast("حداقل یک ستون لازم است"); }
                renderCols();
                renderTable();
                saveCols();
            });
            label.append(cb, el("span", "", def.label));
            li.append(el("span", "h", "⋮⋮"), label);
            if (c.key === "courseNames" && !hasDetails) li.title = "فقط برای لایسنس‌هایی که در پنل باز (expand) شده‌اند پر می‌شود";
            return li;
        })
    );
}

let dragKey = null;
$("#cols").addEventListener("dragstart", (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    dragKey = li.dataset.key;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragKey);
    requestAnimationFrame(() => li.classList.add("dragging"));
});
$("#cols").addEventListener("dragover", (e) => {
    const li = e.target.closest("li");
    if (!dragKey || !li) return;
    e.preventDefault();
    $$("#cols li").forEach((x) => x.classList.remove("drop-before", "drop-after"));
    if (li.dataset.key === dragKey) return;
    const r = li.getBoundingClientRect();
    li.classList.add(e.clientY < r.top + r.height / 2 ? "drop-before" : "drop-after");
});
$("#cols").addEventListener("drop", (e) => {
    e.preventDefault();
    const li = e.target.closest("li");
    if (!dragKey || !li || li.dataset.key === dragKey) return;
    const before = li.classList.contains("drop-before");
    const moving = cols.splice(cols.findIndex((c) => c.key === dragKey), 1)[0];
    let at = cols.findIndex((c) => c.key === li.dataset.key);
    cols.splice(before ? at : at + 1, 0, moving);
    renderCols();
    renderTable();
    saveCols();
});
$("#cols").addEventListener("dragend", () => {
    dragKey = null;
    $$("#cols li").forEach((x) => x.classList.remove("dragging", "drop-before", "drop-after"));
});

$("#resetCols").addEventListener("click", () => {
    cols = DEFAULT_LICENSE_COLS.map((c) => ({ ...c }));
    renderCols();
    renderTable();
    saveCols();
});

// ───────────────────────── meta + export ─────────────────────────
function renderMeta() {
    const dl = $("#meta");
    if (!data) return dl.replaceChildren();
    const items = [
        ["زمان", new Date(data.extractedAt).toLocaleString("fa-IR")],
        ["محدوده", data.scope === "all" ? "همه‌ی صفحات" : "یک صفحه"],
        ["تعداد", `${data.rows.length.toLocaleString("fa-IR")} از ${Number(data.total || data.rows.length).toLocaleString("fa-IR")}`],
    ];
    dl.replaceChildren(...items.flatMap(([k, v]) => [el("dt", "", k), el("dd", "", v)]));
}

function fillPrintArea() {
    const rows = visibleRows();
    $("#printArea").innerHTML = licenseHeaderHtml(data, rows.length) + licenseTableHtml(rows, activeColumns(cols)); // escaped by licenses.js
}

function doExport(format) {
    const rows = visibleRows();
    if (!rows.length) return toast("ردیفی برای خروجی وجود ندارد");
    if (format === "pdf") {
        fillPrintArea();
        const prev = document.title;
        document.title = licenseFilename(data, "pdf").replace(/\.pdf$/, "");
        window.addEventListener("afterprint", () => (document.title = prev), { once: true });
        return window.print();
    }
    exportLicenses(data, rows, activeColumns(cols), format);
    toast(`${rows.length.toLocaleString("fa-IR")} لایسنس خروجی گرفته شد`);
}

$$(".ex").forEach((b) => b.addEventListener("click", () => doExport(b.dataset.format)));
window.addEventListener("beforeprint", () => data && fillPrintArea());

// ───────────────────────── init ─────────────────────────
function show(d) {
    data = d;
    const has = !!(data && data.rows?.length);
    $("#empty").classList.toggle("hidden", has);
    $("#tableWrap").classList.toggle("hidden", !has);
    $$(".ex").forEach((b) => (b.disabled = !has));
    renderMeta();
    renderCols();
    renderTable();
}

(async () => {
    const style = el("style");
    style.textContent = LICENSE_TABLE_CSS;
    document.head.append(style);

    cols = await loadLicenseCols();
    const { [LICENSES_KEY]: d } = await chrome.storage.local.get(LICENSES_KEY);
    show(d || null);

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes[LICENSES_KEY]?.newValue) {
            show(changes[LICENSES_KEY].newValue);
            toast("داده‌ی جدید بارگذاری شد");
        }
    });

    if (location.hash === "#print" && data) {
        history.replaceState(null, "", location.pathname);
        setTimeout(() => doExport("pdf"), 300);
    }
})();
