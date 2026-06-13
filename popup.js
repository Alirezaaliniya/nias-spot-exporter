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

        const count = results?.[0]?.result ?? 0;
        if (count > 0) {
            setStatus(`✓ ${count} درس استخراج شد`, "ok");
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
// Returns the number of lessons exported.
// ──────────────────────────────────────────────
function exportFromPage(settings, format) {
    const items = document.querySelectorAll("x-gi");
    if (!items.length) return 0;

    const chapterIcon = settings.emoji ? "📘 " : "";
    const timeIcon = settings.emoji ? "⏱ " : "";
    const prefix = settings.showChapterPrefix ? settings.chapterPrefix : "";

    let continuous = 1;
    let perChapter = 1;
    let sawChapter = false;
    let lessonCount = 0;

    const escapeHtml = (str) =>
        String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const nextNumber = () =>
        settings.numberingMode === "perChapter" ? perChapter++ : continuous++;

    // Build both representations in one pass; emit only the requested one.
    let html = `
    <html><head><meta charset="utf-8"><style>
        body { font-family:Tahoma; direction:rtl; }
        h1 { background:#f0f0f0; padding:10px; border-radius:8px; }
        .lesson { margin:10px 0; padding:10px; border:1px solid #ddd; border-radius:8px; }
        .number { font-weight:bold; font-size:16px; }
        .title { font-size:15px; margin-top:5px; }
        .meta { font-size:14px; color:#555; margin-top:5px; }
    </style></head><body>`;
    let txt = "";

    items.forEach((item) => {
        const isChapter = item.classList.contains("exp");
        const isLesson = item.classList.contains("med");

        const titleElem = item.querySelector("#name a");
        const timeElem = item.querySelector("#time");
        const title = titleElem ? titleElem.textContent.trim() : "";
        const time = timeElem ? timeElem.textContent.trim() : "";

        if (isChapter) {
            sawChapter = true;
            perChapter = 1;
            html += `<h1>${chapterIcon}${escapeHtml(prefix + title)}</h1>`;
            txt += `\n====================\n${prefix}${title}\n--------------------\n`;
        } else if (isLesson && sawChapter) {
            lessonCount++;
            const num = settings.numbering ? nextNumber() + ". " : "";
            const metaLine =
                settings.showTime && time ? `${timeIcon}${settings.timeLabel}${time}` : "";

            html += `<div class="lesson">
                <div class="number">${escapeHtml(num)}</div>
                <div class="title">${escapeHtml(title)}</div>` +
                (metaLine ? `<div class="meta">${escapeHtml(metaLine)}</div>` : "") +
                `</div>`;

            txt += `${num}${title}\n` + (metaLine ? `${metaLine}\n` : "") + `\n`;
        }
    });

    html += "</body></html>";

    const filename = (settings.filename || "lessons").trim() || "lessons";
    let blob, ext;
    if (format === "doc") {
        blob = new Blob(["﻿", html], { type: "application/msword" });
        ext = "doc";
    } else {
        blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
        ext = "txt";
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);

    return lessonCount;
}
