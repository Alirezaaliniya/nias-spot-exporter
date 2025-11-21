(function () {
    // ───── ساخت UI ─────
    const box = document.createElement("div");
    box.style.position = "fixed";
    box.style.top = "20px";
    box.style.left = "20px";
    box.style.zIndex = "999999";
    box.style.background = "#fff";
    box.style.padding = "15px";
    box.style.borderRadius = "12px";
    box.style.boxShadow = "0 0 15px rgba(0,0,0,0.2)";
    box.style.direction = "rtl";
    box.style.fontFamily = "sans-serif";
    box.innerHTML = `
        <button id="exportDoc" style="padding:10px 20px;margin:5px;border:0;border-radius:8px;background:#4caf50;color:#fff;cursor:pointer;">خروجی Word</button>
        <button id="exportTxt" style="padding:10px 20px;margin:5px;border:0;border-radius:8px;background:#2196F3;color:#fff;cursor:pointer;">خروجی TXT</button>
    `;
    document.body.appendChild(box);

    // ───────────────────────────────────────
    // 📄 خروجی Word
    // ───────────────────────────────────────
    document.getElementById("exportDoc").onclick = async () => {

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
    };

    // ───────────────────────────────────────
    // 📄 خروجی TXT
    // ───────────────────────────────────────
    document.getElementById("exportTxt").onclick = () => {

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
    };

})();
