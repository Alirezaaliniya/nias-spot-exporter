document.addEventListener("DOMContentLoaded", () => {

    document.getElementById("exportDoc").addEventListener("click", () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                func: generateDoc
            });
        });
    });

    document.getElementById("exportTxt").addEventListener("click", () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                func: generateTxt
            });
        });
    });

});


// ──────────────────────────────────────────────
// تابع ساخت فایل Word — اجرا داخل صفحه اسپات پلیر
// ──────────────────────────────────────────────
function generateDoc() {

    const items = document.querySelectorAll('x-gi');
    let currentChapter = null;
    let lessonCounter = 1;

    let html = `
    <html>
    <head>
    <meta charset="utf-8">
    <style>
        body { font-family:Tahoma; direction:rtl; }
        h1 { background:#f0f0f0; padding:10px; border-radius:8px; }
        .lesson { margin:10px 0; padding:10px; border:1px solid #ddd; border-radius:8px; }
        .number { font-weight:bold; font-size:16px; }
        .title { font-size:15px; margin-top:5px; }
        .meta { font-size:14px; color:#555; margin-top:5px; }
    </style>
    </head>
    <body>
    `;

    items.forEach(item => {
        const isChapter = item.classList.contains('exp');
        const isLesson = item.classList.contains('med');

        const titleElem = item.querySelector('#name a');
        const timeElem  = item.querySelector('#time');

        const title = titleElem ? titleElem.textContent.trim() : "";
        const time  = timeElem ? timeElem.textContent.trim() : "";

        if (isChapter) {
            currentChapter = title;
            html += `<h1>📘 فصل: ${title}</h1>`;
        }
        else if (isLesson && currentChapter) {
            html += `
            <div class="lesson">
                <div class="number">${lessonCounter++}.</div>
                <div class="title">${title}</div>
                <div class="meta">⏱ زمان: ${time}</div>
            </div>`;
        }
    });

    html += "</body></html>";

    const blob = new Blob(['\ufeff', html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "lessons.doc";
    a.click();
    URL.revokeObjectURL(url);
}


// ──────────────────────────────────────────────
// تابع ساخت فایل TXT — اجرا داخل صفحه اسپات پلیر
// ──────────────────────────────────────────────
function generateTxt() {

    const items = document.querySelectorAll('x-gi');
    let currentChapter = null;
    let txt = "";
    let counter = 1;

    items.forEach(item => {
        const isChapter = item.classList.contains('exp');
        const isLesson = item.classList.contains('med');

        const titleElem = item.querySelector('#name a');
        const timeElem  = item.querySelector('#time');

        const title = titleElem ? titleElem.textContent.trim() : "";
        const time  = timeElem ? timeElem.textContent.trim() : "";

        if (isChapter) {
            currentChapter = title;
            txt += `\n====================\nفصل: ${title}\n--------------------\n`;
        }
        else if (isLesson && currentChapter) {
            txt += `${counter++}. ${title}\nزمان: ${time}\n\n`;
        }
    });

    const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = "lessons.txt";
    a.click();
    URL.revokeObjectURL(url);
}
