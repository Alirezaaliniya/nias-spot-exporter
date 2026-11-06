// ──────────────────────────────────────────────
// Popup: detect the SpotPlayer panel, then
//   • courses  → pick a course, open it on the editor canvas or export it
//   • licenses → read this page / all pages, open the licenses table or export
// ──────────────────────────────────────────────

const PANEL_HOST = "panel.spotplayer.ir";
const PANEL_URL = "https://panel.spotplayer.ir/course/";
const LICENSE_URL = "https://panel.spotplayer.ir/license/";
const EDITOR_URL = chrome.runtime.getURL("src/editor/editor.html");
const LICENSES_PAGE_URL = chrome.runtime.getURL("src/licenses/licenses.html");

const $ = (id) => document.getElementById(id);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const VIEWS = ["viewNotPanel", "viewLoading", "viewCourses", "viewLicenses"];

let tabId = null;
let selectedId = null;
let licScope = localStorage.getItem("nias.licScope") || "page";
let busy = false;

function show(view) {
    VIEWS.forEach((v) => $(v).classList.toggle("hidden", v !== view));
    $$("#modes button").forEach((b) => b.classList.toggle("active", "view" + cap(b.dataset.mode) === view));
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);

function setStatus(msg, kind = "") {
    $("status").textContent = msg;
    $("status").className = "status" + (kind ? " " + kind : "");
}

function setBusy(on) {
    busy = on;
    [$("toCanvas"), ...$$(".qbtn[data-format]")].forEach((b) => (b.disabled = on || !selectedId));
    $$(".course").forEach((b) => (b.disabled = on || b.dataset.empty === "1"));
    [$("licOpen"), ...$$(".qbtn[data-lformat]"), ...$$("#licScope button"), ...$$("#modes button")].forEach((b) => (b.disabled = on));
}

async function inject(func, args = []) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["src/page/extractor.js"] });
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
    return res?.result;
}

function openTab(url) {
    chrome.tabs.create({ url });
    window.close();
}

// ───────────────────────── progress overlay ─────────────────────────
// Polls the extractor's live counters while it runs (same isolated world).
function startProgress(title, unitA, unitB) {
    const box = $("progress");
    const bar = $("pgBar").parentElement;
    let stopped = false;
    let timer = null;

    $("pgTitle").textContent = title;
    $("pgUnitA").textContent = unitA;
    $("pgUnitB").textContent = unitB;
    $("pgSections").textContent = "0";
    $("pgLessons").textContent = "0";
    $("pgBar").style.width = "";
    bar.classList.add("indeterminate");
    box.classList.remove("hidden");

    const tick = async () => {
        if (stopped) return;
        try {
            const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: () => globalThis.NiasExtractor?.progress?.() });
            const p = r?.result;
            if (p && !stopped) {
                $("pgSections").textContent = p.total ? `${p.done}/${p.total}` : "0";
                $("pgLessons").textContent = String(p.items);
                if (p.total) {
                    bar.classList.remove("indeterminate");
                    $("pgBar").style.width = Math.round((p.done / p.total) * 100) + "%";
                }
            }
        } catch {}
        if (!stopped) timer = setTimeout(tick, 200);
    };
    timer = setTimeout(tick, 150);

    return () => {
        stopped = true;
        clearTimeout(timer);
        box.classList.add("hidden");
    };
}

// ───────────────────────── courses ─────────────────────────
function renderCourses(courses) {
    const box = $("courses");
    box.textContent = "";
    $("courseCount").textContent = `${courses.length} دوره`;
    $("filter").classList.toggle("hidden", courses.length < 6);

    for (const c of courses) {
        const btn = document.createElement("button");
        btn.className = "course";
        btn.setAttribute("role", "radio");
        btn.setAttribute("aria-checked", "false");
        btn.dataset.id = c.id;
        btn.dataset.name = c.title.toLowerCase();
        btn.dataset.empty = c.items ? "0" : "1";
        btn.disabled = !c.items;

        const dot = document.createElement("span");
        dot.className = "dot";
        const info = document.createElement("span");
        info.className = "info";
        const name = document.createElement("span");
        name.className = "name";
        name.textContent = c.title || "بدون نام";
        name.title = c.title;
        const meta = document.createElement("span");
        meta.className = "meta";
        meta.textContent = c.items ? `${c.items} محتوا${c.size ? " · " + c.size : ""}` : "بدون محتوا";
        info.append(name, meta);
        btn.append(dot, info);

        btn.addEventListener("click", () => select(c.id));
        btn.addEventListener("dblclick", () => !busy && runCourse("canvas"));
        box.appendChild(btn);
    }
    const preferred = courses.find((c) => c.expanded && c.items) || courses.find((c) => c.items);
    if (preferred) select(preferred.id);
    else setBusy(false);
}

function select(id) {
    selectedId = id;
    $$(".course").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.id === id)));
    setBusy(false);
}

$("filter").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    $$(".course").forEach((b) => b.classList.toggle("hidden", q && !b.dataset.name.includes(q)));
});

async function runCourse(action) {
    if (!selectedId || busy) return;
    setBusy(true);
    setStatus("");
    const name = document.querySelector(`.course[data-id="${CSS.escape(selectedId)}"] .name`)?.textContent;
    const stop = startProgress(name ? `در حال خواندن «${name}»…` : "در حال خواندن دوره…", "بخش", "جلسه پیدا شد");

    try {
        const res = await inject((id) => globalThis.NiasExtractor.extract(id), [selectedId]);
        stop();
        if (!res?.ok) {
            setStatus(res?.error === "notfound" ? "دوره در صفحه پیدا نشد — صفحه را تازه کنید" : "محتوایی در این دوره پیدا نشد", "err");
            return;
        }
        const doc = makeDoc(res.course);
        await storeExtractedDoc(doc);

        if (action === "canvas" || action === "pdf") return openTab(EDITOR_URL + (action === "pdf" ? "#print" : ""));

        exportFile(doc, await loadSettings(), action);
        const { lessons, walked, expected } = res.stats;
        const partial = expected && walked < expected ? ` (از ${expected} مورد، ${walked} مورد خوانده شد)` : "";
        setStatus(`✓ ${lessons} جلسه خروجی گرفته شد${partial}`, partial ? "" : "ok");
    } catch (e) {
        console.error(e);
        setStatus("خطا در دسترسی به صفحه — صفحه را تازه کرده و دوباره تلاش کنید", "err");
    } finally {
        stop();
        setBusy(false);
    }
}

$("toCanvas").addEventListener("click", () => runCourse("canvas"));
$$(".qbtn[data-format]").forEach((b) => b.addEventListener("click", () => runCourse(b.dataset.format)));

// ───────────────────────── licenses ─────────────────────────
function renderLicenses(info) {
    const ready = info && info.visible;
    $("licGo").classList.toggle("hidden", !!ready);
    $("licReady").classList.toggle("hidden", !ready);
    if (!ready) return;
    $("licTotal").textContent = info.total.toLocaleString("fa-IR");
    $("licOnPage").textContent = info.onPage.toLocaleString("fa-IR");
    if (info.total <= info.onPage) licScope = "page";
    $("licScope").classList.toggle("hidden", info.total <= info.onPage);
    syncScope();
}

function syncScope() {
    $$("#licScope button").forEach((b) => b.classList.toggle("active", b.dataset.scope === licScope));
}

$$("#licScope button").forEach((b) =>
    b.addEventListener("click", () => {
        licScope = b.dataset.scope;
        localStorage.setItem("nias.licScope", licScope);
        syncScope();
    })
);

async function runLicenses(action) {
    if (busy) return;
    setBusy(true);
    setStatus("");
    const all = licScope === "all";
    const stop = startProgress(all ? "در حال خواندن همه‌ی صفحات لایسنس…" : "در حال خواندن لایسنس‌ها…", "صفحه", "لایسنس خوانده شد");

    try {
        const res = await inject((opts) => globalThis.NiasExtractor.extractLicenses(opts), [{ all }]);
        stop();
        if (!res?.ok) {
            setStatus(res?.error === "hidden" || res?.error === "nogrid" ? "صفحه‌ی لایسنس‌ها باز نیست" : "لایسنسی پیدا نشد", "err");
            return;
        }
        await chrome.storage.local.set({ [LICENSES_KEY]: res.data });

        if (action === "view" || action === "pdf") return openTab(LICENSES_PAGE_URL + (action === "pdf" ? "#print" : ""));

        const cols = activeColumns(await loadLicenseCols());
        exportLicenses(res.data, res.data.rows, cols, action);
        const { count, total, partial } = res.stats;
        setStatus(
            partial ? `⚠ ${count} از ${total} لایسنس خوانده شد (رفتن به صفحه‌ی بعد ممکن نشد)` : `✓ ${count} لایسنس خروجی گرفته شد`,
            partial ? "err" : "ok"
        );
    } catch (e) {
        console.error(e);
        setStatus("خطا در دسترسی به صفحه — صفحه را تازه کرده و دوباره تلاش کنید", "err");
    } finally {
        stop();
        setBusy(false);
    }
}

$("licOpen").addEventListener("click", () => runLicenses("view"));
$$(".qbtn[data-lformat]").forEach((b) => b.addEventListener("click", () => runLicenses(b.dataset.lformat)));
$("goLicenses").addEventListener("click", () => {
    chrome.tabs.update(tabId, { url: LICENSE_URL });
    window.close();
});

// ───────────────────────── shared buttons ─────────────────────────
$("openEditor").addEventListener("click", () => openTab(EDITOR_URL));
$("resume").addEventListener("click", () => openTab(EDITOR_URL));
$("goPanel").addEventListener("click", () => openTab(PANEL_URL));
$$("#modes button").forEach((b) =>
    b.addEventListener("click", () => {
        if (busy) return;
        show("view" + cap(b.dataset.mode));
        setStatus("");
    })
);

// ───────────────────────── init ─────────────────────────
(async () => {
    const { doc } = await loadDoc();
    if (doc) $("resume").classList.remove("hidden");

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab?.id;

    let url = null;
    try { url = new URL(tab?.url || ""); } catch {}
    if (url?.host !== PANEL_HOST) return show("viewNotPanel");

    try {
        const res = await inject(() => globalThis.NiasExtractor.scan());
        const hasCourses = !!res?.courses?.length;
        const lic = res?.licenses;
        if (!hasCourses && !lic) {
            show("viewNotPanel");
            setStatus("فهرست دوره یا لایسنس در این صفحه پیدا نشد", "err");
            return;
        }

        $("modes").classList.remove("hidden");
        renderCourses(res.courses || []);
        renderLicenses(lic);
        if (!hasCourses) $("courses").textContent = "دوره‌ای در این صفحه نیست — به بخش «دوره‌ها» بروید.";

        const onLicensePage = (lic && lic.visible) || url.pathname.startsWith("/license");
        show(onLicensePage ? "viewLicenses" : "viewCourses");
    } catch (e) {
        console.error(e);
        show("viewNotPanel");
        setStatus("دسترسی به صفحه ممکن نشد — صفحه را تازه کنید", "err");
    }
})();
