// ──────────────────────────────────────────────
// Popup logic: load settings, run the exporter inside the Spot Player tab,
// and report a short status back to the user.
// ──────────────────────────────────────────────

const statusEl = document.getElementById("status");

function setStatus(msg, kind = "") {
    statusEl.textContent = msg;
    statusEl.className = "status" + (kind ? " " + kind : "");
}

document.getElementById("openOptions").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
});

document.getElementById("exportDoc").addEventListener("click", () => runExport("doc"));
document.getElementById("exportTxt").addEventListener("click", () => runExport("txt"));
document.getElementById("exportJson").addEventListener("click", () => runExport("json"));

async function runExport(format) {
    const buttons = document.querySelectorAll(".btn");
    buttons.forEach(b => (b.disabled = true));
    setStatus("در حال استخراج…");

    try {
        const settings = await loadSettings();
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: exportFromPage,
            args: [settings, format],
        });

        const res = results?.[0]?.result || { status: "empty" };
        if (res.status === "done") {
            setStatus(`✓ ${res.count} مورد استخراج شد`, "ok");
        } else if (res.status === "modal") {
            setStatus(`${res.count} دوره پیدا شد — یکی را در صفحه انتخاب کنید`, "ok");
        } else {
            setStatus("موردی یافت نشد — مطمئن شوید در صفحه‌ی اسپات پلیر هستید", "err");
        }
    } catch (e) {
        setStatus("خطا در استخراج — صفحه‌ی فعال پشتیبانی نمی‌شود", "err");
    } finally {
        buttons.forEach(b => (b.disabled = false));
    }
}

// ──────────────────────────────────────────────
// Injected into the Spot Player page. Cannot close over popup scope —
// every value comes from the `settings` / `format` arguments.
//
// Returns one of:
//   { status: "done", count }   downloaded a single course
//   { status: "modal", count }  showed the course picker; download happens on click
//   { status: "empty" }         nothing found on the page
// ──────────────────────────────────────────────
function exportFromPage(settings, format) {
    const MODAL_ID = "nias-exporter-modal";
    const existing = document.getElementById(MODAL_ID);
    if (existing) existing.remove();

    const esc = (s) =>
        String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const textOf = (el) => (el ? el.textContent.trim() : "");

    // Title of a course/section row — only its OWN name, not nested items'.
    // NOTE: Spot Player reuses id="name"/id="time" across many rows (invalid HTML),
    // so ID selectors resolve unreliably. Use attribute selectors, which scope correctly.
    function ownTitle(el) {
        const a = el.querySelector(':scope > x-gr [id="name"] a');
        return a ? a.textContent.trim() : "";
    }

    // Walk a course element's items (in document order) into chapters → lessons.
    // Sections (x-gi.exp) start a new chapter; everything else with a name is a
    // lesson. Courses with no sections (just videos/text) fall back to a single
    // chapter named after the course.
    function collectCourse(courseEl) {
        const courseTitle = ownTitle(courseEl);
        const chapters = [];
        let current = null;
        let lessonCount = 0;

        const ensureChapter = () => {
            if (!current) {
                current = { title: courseTitle || "دوره", lessons: [] };
                chapters.push(current);
            }
            return current;
        };

        courseEl.querySelectorAll("x-gi").forEach((item) => {
            const row = item.querySelector(":scope > x-gr");
            if (!row) return;
            const nameA = row.querySelector('[id="name"] a');
            const title = nameA ? nameA.textContent.trim() : "";

            if (item.classList.contains("exp")) {
                if (!title) return;
                current = { title, lessons: [] };
                chapters.push(current);
            } else if (nameA) {
                ensureChapter().lessons.push({
                    title,
                    time: textOf(row.querySelector('[id="time"]')),
                });
                lessonCount++;
            }
        });

        return { title: courseTitle, chapters, lessonCount };
    }

    // ── output builders ────────────────────────────────────────────
    function buildHtml(data) {
        const chapterIcon = settings.emoji ? "📘 " : "";
        const timeIcon = settings.emoji ? "⏱ " : "";
        const prefix = settings.showChapterPrefix ? settings.chapterPrefix : "";
        let continuous = 1;

        let html = `<html><head><meta charset="utf-8"><style>
            body { font-family:Tahoma; direction:rtl; }
            h1 { background:#f0f0f0; padding:10px; border-radius:8px; }
            .lesson { margin:10px 0; padding:10px; border:1px solid #ddd; border-radius:8px; }
            .number { font-weight:bold; font-size:16px; }
            .title { font-size:15px; margin-top:5px; }
            .meta { font-size:14px; color:#555; margin-top:5px; }
        </style></head><body>`;

        data.chapters.forEach((ch) => {
            let perChapter = 1;
            html += `<h1>${chapterIcon}${esc(prefix + ch.title)}</h1>`;
            ch.lessons.forEach((ls) => {
                const num = settings.numbering
                    ? (settings.numberingMode === "perChapter" ? perChapter++ : continuous++) + ". "
                    : "";
                const meta =
                    settings.showTime && ls.time ? `${timeIcon}${settings.timeLabel}${ls.time}` : "";
                html += `<div class="lesson">
                    <div class="number">${esc(num)}</div>
                    <div class="title">${esc(ls.title)}</div>` +
                    (meta ? `<div class="meta">${esc(meta)}</div>` : "") +
                    `</div>`;
            });
        });

        return html + "</body></html>";
    }

    function buildTxt(data) {
        const timeIcon = settings.emoji ? "⏱ " : "";
        const prefix = settings.showChapterPrefix ? settings.chapterPrefix : "";
        let continuous = 1;
        let out = "";

        data.chapters.forEach((ch) => {
            let perChapter = 1;
            out += `\n====================\n${prefix}${ch.title}\n--------------------\n`;
            ch.lessons.forEach((ls) => {
                const num = settings.numbering
                    ? (settings.numberingMode === "perChapter" ? perChapter++ : continuous++) + ". "
                    : "";
                const meta =
                    settings.showTime && ls.time ? `${timeIcon}${settings.timeLabel}${ls.time}` : "";
                out += `${num}${ls.title}\n` + (meta ? `${meta}\n` : "") + `\n`;
            });
        });

        return out;
    }

    // Exact requested shape: { chapters: [ { title, lessons: [ { title } ] } ] }
    function buildJson(data) {
        return JSON.stringify(
            {
                chapters: data.chapters.map((ch) => ({
                    title: ch.title,
                    lessons: ch.lessons.map((ls) => ({ title: ls.title })),
                })),
            },
            null,
            2
        );
    }

    function sanitize(name) {
        return (name || "").replace(/[\\/:*?"<>|]+/g, "_").trim();
    }

    function download(data) {
        const base = sanitize(data.title) || (settings.filename || "lessons");
        let blob, ext;
        if (format === "doc") {
            blob = new Blob(["﻿", buildHtml(data)], { type: "application/msword" });
            ext = "doc";
        } else if (format === "json") {
            blob = new Blob([buildJson(data)], { type: "application/json;charset=utf-8" });
            ext = "json";
        } else {
            blob = new Blob([buildTxt(data)], { type: "text/plain;charset=utf-8" });
            ext = "txt";
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${base}.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ── course picker modal (in-page, survives popup closing) ───────
    function showPicker(courses) {
        const overlay = document.createElement("div");
        overlay.id = MODAL_ID;
        overlay.innerHTML = `
            <style>
                #${MODAL_ID} { position:fixed; inset:0; z-index:2147483647;
                    background:rgba(15,23,42,.55); display:flex; align-items:center;
                    justify-content:center; direction:rtl;
                    font-family:"Vazirmatn",Tahoma,system-ui,sans-serif; }
                #${MODAL_ID} .box { background:#fff; width:420px; max-width:92vw;
                    max-height:80vh; border-radius:16px; overflow:hidden;
                    box-shadow:0 20px 60px rgba(0,0,0,.35); display:flex; flex-direction:column; }
                #${MODAL_ID} .head { padding:16px 20px; font-size:16px; font-weight:700;
                    color:#1f2430; border-bottom:1px solid #eee; }
                #${MODAL_ID} .head span { font-size:12px; font-weight:400; color:#6b7280; }
                #${MODAL_ID} .list { padding:10px; overflow:auto; }
                #${MODAL_ID} .item { display:flex; justify-content:space-between; gap:10px;
                    align-items:center; width:100%; text-align:right; padding:12px 14px;
                    margin:6px 0; border:1px solid #e5e7eb; border-radius:10px; background:#fff;
                    cursor:pointer; font-size:14px; color:#1f2430; font-family:inherit;
                    transition:background .15s,border-color .15s; }
                #${MODAL_ID} .item:hover { background:#eef2ff; border-color:#4f46e5; }
                #${MODAL_ID} .item .count { color:#6b7280; font-size:12px; white-space:nowrap; }
                #${MODAL_ID} .foot { padding:12px 20px; border-top:1px solid #eee; text-align:left; }
                #${MODAL_ID} .close { border:0; background:#f3f4f6; color:#374151;
                    padding:8px 18px; border-radius:8px; cursor:pointer; font-family:inherit; font-size:13px; }
                #${MODAL_ID} .close:hover { background:#e5e7eb; }
            </style>
            <div class="box">
                <div class="head">یک دوره را برای خروجی انتخاب کنید <span>(${courses.length} دوره)</span></div>
                <div class="list"></div>
                <div class="foot"><button class="close">بستن</button></div>
            </div>`;

        const list = overlay.querySelector(".list");
        courses.forEach((courseEl, i) => {
            const data = collectCourse(courseEl);
            const btn = document.createElement("button");
            btn.className = "item";
            btn.innerHTML =
                `<span>${esc(data.title || "دوره " + (i + 1))}</span>` +
                `<span class="count">${data.lessonCount} مورد</span>`;
            btn.addEventListener("click", () => {
                if (data.lessonCount) download(data);
                overlay.remove();
            });
            list.appendChild(btn);
        });

        overlay.querySelector(".close").addEventListener("click", () => overlay.remove());
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) overlay.remove();
        });
        document.body.appendChild(overlay);
    }

    // ── entry point ─────────────────────────────────────────────────
    const courses = Array.from(document.querySelectorAll("x-gi.course"));

    if (courses.length > 1) {
        showPicker(courses);
        return { status: "modal", count: courses.length };
    }

    // Single course, or a legacy single-course page with no .course wrapper.
    const root = courses[0] || document.body;
    const data = collectCourse(root);
    if (!data.lessonCount) return { status: "empty" };
    download(data);
    return { status: "done", count: data.lessonCount };
}
