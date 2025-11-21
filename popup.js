document.getElementById("exportDoc").onclick = async () => {
chrome.scripting.executeScript({
target: { tabId: (await chrome.tabs.query({active:true, currentWindow:true}))[0].id },
func: generateDoc
});
};


document.getElementById("exportTxt").onclick = async () => {
chrome.scripting.executeScript({
target: { tabId: (await chrome.tabs.query({active:true, currentWindow:true}))[0].id },
func: generateTxt
});
};


// ───── تابع ساخت DOC (بدون حجم) ─────
function generateDoc() {
const items = document.querySelectorAll('x-gi');
let currentChapter = null;
let lessonCounter = 1;
let html = `
<html xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
<meta charset="UTF-8">
<style>
body { font-family: 'Tahoma'; direction: rtl; }
h1 { color: #333; border-bottom: 2px solid #999; padding-bottom: 5px; }
.lesson { margin: 10px 0; padding: 10px; border: 1px solid #ccc; border-radius: 8px; }
.number { font-weight: bold; font-size: 18px; color: #0078D4; }
.title { font-size: 16px; font-weight: bold; }
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
