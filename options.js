// ──────────────────────────────────────────────
// Options page logic — reads/writes chrome.storage.sync via settings.js helpers.
// ──────────────────────────────────────────────

const els = {
    showChapterPrefix: document.getElementById("showChapterPrefix"),
    chapterPrefix: document.getElementById("chapterPrefix"),
    numbering: document.getElementById("numbering"),
    numberingModeField: document.getElementById("numberingModeField"),
    showTime: document.getElementById("showTime"),
    timeLabel: document.getElementById("timeLabel"),
    filename: document.getElementById("filename"),
    emoji: document.getElementById("emoji"),
    preview: document.getElementById("preview"),
    save: document.getElementById("save"),
    savedMsg: document.getElementById("savedMsg"),
};

function getNumberingMode() {
    const checked = document.querySelector('input[name="numberingMode"]:checked');
    return checked ? checked.value : "continuous";
}

function setNumberingMode(mode) {
    const el = document.querySelector(`input[name="numberingMode"][value="${mode}"]`);
    if (el) el.checked = true;
}

// Reflect the form back into a settings object.
function readForm() {
    return {
        showChapterPrefix: els.showChapterPrefix.checked,
        chapterPrefix: els.chapterPrefix.value,
        numbering: els.numbering.checked,
        numberingMode: getNumberingMode(),
        showTime: els.showTime.checked,
        timeLabel: els.timeLabel.value,
        filename: els.filename.value.trim() || DEFAULT_SETTINGS.filename,
        emoji: els.emoji.checked,
    };
}

// Populate the form from a settings object.
function fillForm(s) {
    els.showChapterPrefix.checked = s.showChapterPrefix;
    els.chapterPrefix.value = s.chapterPrefix;
    els.numbering.checked = s.numbering;
    setNumberingMode(s.numberingMode);
    els.showTime.checked = s.showTime;
    els.timeLabel.value = s.timeLabel;
    els.filename.value = s.filename;
    els.emoji.checked = s.emoji;
}

// Enable/disable dependent fields and refresh the live preview.
function refreshUI() {
    const s = readForm();

    els.chapterPrefix.disabled = !s.showChapterPrefix;
    els.numberingModeField.style.opacity = s.numbering ? "1" : ".45";
    els.numberingModeField.style.pointerEvents = s.numbering ? "auto" : "none";
    els.timeLabel.disabled = !s.showTime;

    const icon = s.emoji ? "📘 " : "";
    const prefix = s.showChapterPrefix ? s.chapterPrefix : "";
    const num = s.numbering ? "1. " : "";
    const timeIcon = s.emoji ? "⏱ " : "";
    const timeLine = s.showTime ? `\n    ${timeIcon}${s.timeLabel}12:34` : "";

    els.preview.innerHTML =
        `<div class="pv-chapter">${icon}${escapeHtml(prefix)}عنوان فصل نمونه</div>` +
        `<div>${num}عنوان درس نمونه` +
        `<span class="pv-meta">${escapeHtml(timeLine)}</span></div>`;
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

async function save() {
    const s = readForm();
    await chrome.storage.sync.set(s);
    fillForm(s); // normalize (e.g. filename fallback)
    els.savedMsg.classList.add("show");
    setTimeout(() => els.savedMsg.classList.remove("show"), 1600);
}

// Wire up: live preview on every change, plus explicit save button.
document.addEventListener("input", refreshUI);
document.addEventListener("change", refreshUI);
els.save.addEventListener("click", save);

(async () => {
    fillForm(await loadSettings());
    refreshUI();
})();
