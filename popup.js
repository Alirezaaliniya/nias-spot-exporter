document.getElementById("exportDoc").onclick = async () => {
.meta { font-size: 14px; color: #555; margin-top: 5px; }
</style>
</head>
<body>
`;


items.forEach(item => {
const isChapter = item.classList.contains('exp');
const isLesson = item.classList.contains('med');


const titleElem = item.querySelector('#name a');
const timeElem = item.querySelector('#time');


const title = titleElem ? titleElem.textContent.trim() : "";
const time = timeElem ? timeElem.textContent.trim() : "";


if (isChapter) {
currentChapter = title;
html += `<h1>📘 فصل: ${title}</h1>`;
} else if (isLesson && currentChapter) {
html += `
<div class="lesson">
<div class="number">${lessonCounter++}.</div>
<div class="title">${title}</div>
<div class="meta">⏱ زمان: ${time}</div>
</div>
`;
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


// ───── تابع ساخت فایل TXT ─────
function generateTxt() {
const items = document.querySelectorAll('x-gi');
let currentChapter = null;
let txt = "";
let counter = 1;


items.forEach(item => {
const isChapter = item.classList.contains('exp');
const isLesson = item.classList.contains('med');


const titleElem = item.querySelector('#name a');
const timeElem = item.querySelector('#time');


const title = titleElem ? titleElem.textContent.trim() : "";
const time = timeElem ? timeElem.textContent.trim() : "";


if (isChapter) {
currentChapter = title;
txt += `\n====================\nفصل: ${title}\n--------------------\n`;
}
else if (isLesson && currentChapter) {
txt += `${counter++}. ${title} \n زمان: ${time}\n\n`;
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
