// ──────────────────────────────────────────────
// Popup logic: load settings, run the exporter inside the Spot Player tab,
// and report a short status back to the user.
// ──────────────────────────────────────────────

const statusEl = document.getElementById("status");

function setStatus(msg, kind = "") {
    statusEl.textContent = msg;
    statusEl.className = "status" + (kind ? " " + kind : "");
}

// Pages where chrome.scripting cannot run (browser internals, etc.).
function isRestrictedTabUrl(url) {
    if (!url) return true;
    return /^(chrome|chrome-extension|edge|about|devtools|view-source|brave|opera|vivaldi):/i.test(
        url
    );
}

// Soft hostname hint — Spot Player web apps typically live on *spotplayer* hosts.
function looksLikeSpotPlayerHost(url) {
    try {
        return /spotplayer/i.test(new URL(url).hostname);
    } catch {
        return false;
    }
}

document.getElementById("openOptions").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
});

document.getElementById("exportDoc").addEventListener("click", () => runExport("doc"));
document.getElementById("exportTxt").addEventListener("click", () => runExport("txt"));
document.getElementById("exportJson").addEventListener("click", () => runExport("json"));
document.getElementById("exportPdf").addEventListener("click", () => runExport("pdf"));

async function runExport(format) {
    const buttons = document.querySelectorAll(".btn");
    buttons.forEach(b => (b.disabled = true));
    setStatus("در حال استخراج…");

    try {
        const settings = await loadSettings();
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab?.id || isRestrictedTabUrl(tab.url)) {
            setStatus("این صفحه قابل استخراج نیست", "err");
            return;
        }

        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: exportFromPage,
            args: [settings, format],
        });

        const res = results?.[0]?.result || { status: "empty" };
        if (res.status === "pdf") {
            setStatus(`✓ ${res.count} مورد — در پنجره‌ی چاپ «ذخیره به‌صورت PDF» را انتخاب کنید`, "ok");
        } else if (res.status === "done") {
            setStatus(`✓ ${res.count} مورد استخراج شد`, "ok");
        } else if (res.status === "modal") {
            setStatus(`${res.count} دوره پیدا شد — یکی را در صفحه انتخاب کنید`, "ok");
        } else if (res.status === "unsupported") {
            // Prefer hostname hint when DOM markers are missing on a non-Spot host.
            setStatus(
                looksLikeSpotPlayerHost(tab.url)
                    ? "لیست جلسات پیدا نشد؛ مطمئن شوید دوره باز است"
                    : "لطفاً به صفحه اسپات‌پلیر بروید",
                "err"
            );
        } else {
            // Spot Player DOM present, but no exportable lessons.
            setStatus("لیست جلسات پیدا نشد؛ مطمئن شوید دوره باز است", "err");
        }
    } catch (e) {
        setStatus("این صفحه قابل استخراج نیست", "err");
    } finally {
        buttons.forEach(b => (b.disabled = false));
    }
}

// ──────────────────────────────────────────────
// Injected into the Spot Player page. Cannot close over popup scope —
// every value comes from the `settings` / `format` arguments.
//
// Returns one of:
//   { status: "done", count }          downloaded a single course
//   { status: "pdf", count }           opened the print dialog for PDF
//   { status: "modal", count }         showed the course picker; download happens on click
//   { status: "unsupported" }          page has no Spot Player DOM markers
//   { status: "empty" }                Spot Player page, but nothing exportable
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
    // Shared chapter/lesson markup used by both the Word and PDF documents.
    function bodyHtml(data) {
        const chapterIcon = settings.emoji ? "📘 " : "";
        const timeIcon = settings.emoji ? "⏱ " : "";
        const prefix = settings.showChapterPrefix ? settings.chapterPrefix : "";
        let continuous = 1;
        let html = "";

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

        return html;
    }

    function buildHtml(data) {
        return `<html><head><meta charset="utf-8"><style>
            body { font-family:Tahoma; direction:rtl; }
            h1 { background:#f0f0f0; padding:10px; border-radius:8px; }
            .lesson { margin:10px 0; padding:10px; border:1px solid #ddd; border-radius:8px; }
            .number { font-weight:bold; font-size:16px; }
            .title { font-size:15px; margin-top:5px; }
            .meta { font-size:14px; color:#555; margin-top:5px; }
        </style></head><body>${bodyHtml(data)}</body></html>`;
    }

    // Print-ready document. Persian is rendered by the browser's own engine
    // (perfect shaping + RTL), then the user saves it via "Save as PDF".
    function buildPrintHtml(data) {
        const title = esc(data.title || "lessons");
        return `<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
            <title>${title}</title>
            <style>
                @page { size:A4; margin:1.6cm; }
                * { box-sizing:border-box; }
                body { font-family:"Vazirmatn",Tahoma,"Segoe UI",system-ui,sans-serif;
                    direction:rtl; color:#1f2430; margin:0; padding:24px; line-height:1.8; }
                .doc-title { font-size:22px; font-weight:700; margin:0 0 18px; text-align:center; }
                h1 { font-size:16px; background:#eef2ff; color:#312e81; padding:9px 12px;
                    border-radius:8px; margin:18px 0 10px; }
                .lesson { margin:8px 0; padding:9px 12px; border:1px solid #e5e7eb;
                    border-radius:8px; page-break-inside:avoid; }
                .number { font-weight:700; display:inline; color:#4f46e5; }
                .title { font-size:14px; display:inline; }
                .meta { font-size:12.5px; color:#6b7280; margin-top:4px; }
                .hint { background:#fef3c7; color:#92400e; padding:10px 14px; border-radius:8px;
                    font-size:13px; margin-bottom:16px; text-align:center; }
                @media print { .hint { display:none; } }
            </style></head><body>
            <div class="hint">برای ذخیره‌ی PDF، در پنجره‌ی چاپ مقصد (Destination) را روی «ذخیره به‌صورت PDF / Save as PDF» بگذارید.</div>
            <div class="doc-title">${title}</div>
            ${bodyHtml(data)}
            </body></html>`;
    }

    // Render the print document in a hidden same-origin iframe and open the print
    // dialog. Works regardless of the popup closing and avoids popup blocking.
    function printViaIframe(html) {
        const old = document.getElementById("nias-print-frame");
        if (old) old.remove();

        const iframe = document.createElement("iframe");
        iframe.id = "nias-print-frame";
        iframe.style.cssText =
            "position:fixed; right:0; bottom:0; width:0; height:0; border:0; opacity:0;";
        document.body.appendChild(iframe);

        let printed = false;
        const go = () => {
            if (printed) return;
            printed = true;
            try {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
            } catch (e) {}
        };

        iframe.onload = go;
        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write(html);
        doc.close();
        setTimeout(go, 500); // fallback if onload doesn't fire for written docs
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
        // PDF is rendered via a hidden iframe + the browser's print dialog.
        if (format === "pdf") {
            printViaIframe(buildPrintHtml(data));
            return;
        }

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
                #${MODAL_ID} .item:hover:not(:disabled) { background:#eef2ff; border-color:#4f46e5; }
                #${MODAL_ID} .item:disabled { opacity:.55; cursor:not-allowed; background:#f9fafb; }
                #${MODAL_ID} .item .count { color:#6b7280; font-size:12px; white-space:nowrap; }
                #${MODAL_ID} .item .count.empty { color:#b45309; }
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
            const hasLessons = data.lessonCount > 0;
            const btn = document.createElement("button");
            btn.className = "item";
            btn.disabled = !hasLessons;
            btn.title = hasLessons
                ? ""
                : "این دوره جلسه‌ای برای استخراج ندارد";
            btn.innerHTML =
                `<span>${esc(data.title || "دوره " + (i + 1))}</span>` +
                (hasLessons
                    ? `<span class="count">${data.lessonCount} مورد</span>`
                    : `<span class="count empty">بدون جلسه</span>`);
            btn.addEventListener("click", () => {
                if (!hasLessons) return;
                download(data);
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
    // Spot Player uses custom elements (x-gi / x-gr). Absence ≈ wrong site.
    const hasSpotDom = !!document.querySelector("x-gi, x-gr");
    if (!hasSpotDom) return { status: "unsupported" };

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
    return { status: format === "pdf" ? "pdf" : "done", count: data.lessonCount };
}
