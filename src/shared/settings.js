// ──────────────────────────────────────────────
// Shared settings: content options + visual style.
// Keys are flat (same as v1) so values saved by older versions keep working.
// Stored in chrome.storage.sync (small); documents live in chrome.storage.local.
// ──────────────────────────────────────────────

const DEFAULT_SETTINGS = {
    // ── content ──
    showDocTitle: true,
    showChapterPrefix: true,
    chapterPrefix: "فصل: ",
    numbering: true,
    numberingMode: "continuous", // "continuous" | "perChapter"
    showTime: true,
    timeLabel: "زمان: ",
    emoji: true,
    filename: "",                // empty → course title

    // ── style ──
    theme: "indigo",
    fontFamily: "Vazirmatn",
    baseSize: 14,
    chapterSize: 16,
    titleSize: 22,
    lessonStyle: "card",         // "card" | "list" | "compact"
    radius: 8,
    spacing: 8,
    accent: "#4f46e5",
    chapterBg: "#eef2ff",
    chapterColor: "#312e81",
    textColor: "#1f2430",
    mutedColor: "#6b7280",
    borderColor: "#e5e7eb",
    pageBg: "#ffffff",
};

// Ready-made colour themes (applied over the colour keys above).
const THEMES = {
    indigo:  { accent: "#4f46e5", chapterBg: "#eef2ff", chapterColor: "#312e81", textColor: "#1f2430", mutedColor: "#6b7280", borderColor: "#e5e7eb", pageBg: "#ffffff" },
    emerald: { accent: "#059669", chapterBg: "#ecfdf5", chapterColor: "#064e3b", textColor: "#1f2937", mutedColor: "#6b7280", borderColor: "#d1fae5", pageBg: "#ffffff" },
    rose:    { accent: "#e11d48", chapterBg: "#fff1f2", chapterColor: "#881337", textColor: "#1f2937", mutedColor: "#6b7280", borderColor: "#fecdd3", pageBg: "#ffffff" },
    amber:   { accent: "#d97706", chapterBg: "#fffbeb", chapterColor: "#78350f", textColor: "#292524", mutedColor: "#78716c", borderColor: "#fde68a", pageBg: "#fffdf7" },
    slate:   { accent: "#334155", chapterBg: "#f1f5f9", chapterColor: "#0f172a", textColor: "#0f172a", mutedColor: "#64748b", borderColor: "#e2e8f0", pageBg: "#ffffff" },
    mono:    { accent: "#000000", chapterBg: "#ffffff", chapterColor: "#000000", textColor: "#000000", mutedColor: "#444444", borderColor: "#bbbbbb", pageBg: "#ffffff" },
};

const FONTS = {
    Vazirmatn: '"Vazirmatn", Tahoma, "Segoe UI", sans-serif',
    Tahoma: 'Tahoma, "Segoe UI", sans-serif',
    "IRANSans": '"IRANSans", "IRANSansX", Tahoma, sans-serif',
    "B Nazanin": '"B Nazanin", "Nazanin", "Times New Roman", serif',
    "Segoe UI": '"Segoe UI", Tahoma, sans-serif',
    Arial: 'Arial, Tahoma, sans-serif',
};

async function loadSettings() {
    const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS, ...stored };
}

function saveSettings(s) {
    const clean = {};
    for (const k of Object.keys(DEFAULT_SETTINGS)) clean[k] = s[k] ?? DEFAULT_SETTINGS[k];
    return chrome.storage.sync.set(clean);
}

// ── document storage (large → local) ──
const DOC_KEY = "doc";
const ORIGINAL_KEY = "docOriginal";

async function loadDoc() {
    const r = await chrome.storage.local.get([DOC_KEY, ORIGINAL_KEY]);
    return { doc: r[DOC_KEY] || null, original: r[ORIGINAL_KEY] || null };
}

function saveDoc(doc) {
    return chrome.storage.local.set({ [DOC_KEY]: doc });
}

function storeExtractedDoc(doc) {
    return chrome.storage.local.set({ [DOC_KEY]: doc, [ORIGINAL_KEY]: doc });
}
