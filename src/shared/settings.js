// ──────────────────────────────────────────────
// Shared settings module
// Loaded via <script src="settings.js"> in both popup.html and options.html.
// Exposes a global DEFAULT_SETTINGS object and a loadSettings() helper.
// ──────────────────────────────────────────────

const DEFAULT_SETTINGS = {
    showChapterPrefix: true,
    chapterPrefix: "فصل: ",      // text before each chapter title; user can clear it
    numbering: true,             // show "1. 2. 3." before lessons
    numberingMode: "continuous", // "continuous" | "perChapter"
    showTime: true,
    timeLabel: "زمان: ",
    filename: "lessons",         // no extension; extension added per format
    emoji: true,                 // 📘 / ⏱ decorations
};

// Returns stored settings merged over the defaults, so missing keys fall back safely.
async function loadSettings() {
    const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS, ...stored };
}
