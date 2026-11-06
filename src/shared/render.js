// ──────────────────────────────────────────────
// Shared rendering / export builders. Used by the editor (canvas + exports)
// and the popup (quick exports). Pure functions, no chrome.* calls.
//
// Document model:
//   { title, source:{courseId,url,extractedAt},
//     chapters:[{ id, title, hidden, lessons:[{ id, title, time, type, hidden }] }] }
// ──────────────────────────────────────────────

const esc = (s) =>
    String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

// Visible content with display numbers/labels resolved — the single source of
// truth for what every output contains.
// lesson id → "N." for every visible lesson (hidden ones are skipped).
function numberMap(doc, s) {
    const map = new Map();
    if (!s.numbering) return map;
    let continuous = 1;
    for (const ch of doc.chapters || []) {
        if (ch.hidden) continue;
        let perChapter = 1;
        for (const ls of ch.lessons) {
            if (ls.hidden) continue;
            map.set(ls.id, (s.numberingMode === "perChapter" ? perChapter++ : continuous++) + ".");
        }
    }
    return map;
}

const chapterLabelPrefix = (s) => (s.emoji ? "📘 " : "") + (s.showChapterPrefix ? s.chapterPrefix : "");
const lessonMeta = (ls, s) => (s.showTime && ls.time ? `${s.emoji ? "⏱ " : ""}${s.timeLabel}${ls.time}` : "");

function resolveDoc(doc, s) {
    const nums = numberMap(doc, s);
    const prefix = chapterLabelPrefix(s);
    const chapters = (doc.chapters || [])
        .filter((ch) => !ch.hidden)
        .map((ch) => ({
            ...ch,
            label: prefix + ch.title,
            lessons: ch.lessons
                .filter((ls) => !ls.hidden)
                .map((ls) => ({ ...ls, num: nums.get(ls.id) || "", meta: lessonMeta(ls, s) })),
        }));
    return { title: doc.title || "", chapters };
}

// Concrete CSS values (no CSS variables) so Word renders it too.
function docCss(s, scope = ".nias-doc") {
    const font = (typeof FONTS !== "undefined" && FONTS[s.fontFamily]) || s.fontFamily || "Tahoma";
    const r = Number(s.radius) || 0;
    const sp = Number(s.spacing) || 0;
    const base = Number(s.baseSize) || 14;
    const style = s.lessonStyle;

    const lesson =
        style === "list"
            ? `margin:0; padding:${sp}px 4px; border:0; border-bottom:1px solid ${s.borderColor};`
            : style === "compact"
            ? `margin:${Math.round(sp / 3)}px 0; padding:${Math.round(sp / 2)}px 8px; border:0;`
            : `margin:${sp}px 0; padding:${sp + 2}px 12px; border:1px solid ${s.borderColor}; border-radius:${r}px;`;

    const meta =
        style === "compact"
            ? `display:inline; margin-right:10px; font-size:${base - 2}px; color:${s.mutedColor};`
            : `display:block; margin-top:3px; font-size:${base - 1.5}px; color:${s.mutedColor};`;

    return `
${scope} { font-family:${font}; direction:rtl; text-align:right; color:${s.textColor};
    background:${s.pageBg}; font-size:${base}px; line-height:1.8; }
${scope} .nd-title { font-size:${s.titleSize}px; font-weight:700; text-align:center;
    margin:0 0 ${sp * 2}px; color:${s.chapterColor}; }
${scope} .nd-ch { margin:${sp * 2}px 0 ${sp}px; }
${scope} .nd-ch-h { font-size:${s.chapterSize}px; font-weight:700; background:${s.chapterBg};
    color:${s.chapterColor}; padding:${sp + 1}px 12px; border-radius:${r}px; margin:0 0 ${sp}px;
    border-right:4px solid ${s.accent}; }
${scope} .nd-ls { ${lesson} page-break-inside:avoid; break-inside:avoid; }
${scope} .nd-num { font-weight:700; color:${s.accent}; margin-left:6px; }
${scope} .nd-tt { font-size:${base}px; }
${scope} .nd-mt { ${meta} }
`;
}

function docBodyHtml(doc, s) {
    const d = resolveDoc(doc, s);
    let html = s.showDocTitle && d.title ? `<div class="nd-title">${esc(d.title)}</div>` : "";
    for (const ch of d.chapters) {
        html += `<div class="nd-ch"><div class="nd-ch-h">${esc(ch.label)}</div>`;
        for (const ls of ch.lessons) {
            html +=
                `<div class="nd-ls">` +
                (ls.num ? `<span class="nd-num">${esc(ls.num)}</span>` : "") +
                `<span class="nd-tt">${esc(ls.title)}</span>` +
                (ls.meta ? `<span class="nd-mt">${esc(ls.meta)}</span>` : "") +
                `</div>`;
        }
        html += `</div>`;
    }
    return html;
}

function buildWord(doc, s) {
    return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>${esc(doc.title)}</title>
<style>@page { size:21cm 29.7cm; margin:1.8cm; } body { margin:0; } ${docCss(s, "body")}</style>
</head><body dir="rtl">${docBodyHtml(doc, s)}</body></html>`;
}

function buildTxt(doc, s) {
    const d = resolveDoc(doc, s);
    let out = s.showDocTitle && d.title ? `${d.title}\n` : "";
    for (const ch of d.chapters) {
        out += `\n====================\n${ch.label}\n--------------------\n`;
        for (const ls of ch.lessons) {
            out += `${ls.num ? ls.num + " " : ""}${ls.title}\n` + (ls.meta ? `${ls.meta}\n` : "") + `\n`;
        }
    }
    return out.replace(/^\n/, "");
}

// Same shape as v1: { chapters: [ { title, lessons: [ { title } ] } ] }
function buildJson(doc) {
    const d = resolveDoc(doc, { ...DEFAULT_SETTINGS, numbering: false, showTime: false });
    return JSON.stringify(
        { chapters: d.chapters.map((ch) => ({ title: ch.title, lessons: ch.lessons.map((ls) => ({ title: ls.title })) })) },
        null,
        2
    );
}

function exportFilename(doc, s, ext) {
    const raw = (s.filename || "").trim() || doc.title || "lessons";
    const base = raw.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").trim().slice(0, 120) || "lessons";
    return `${base}.${ext}`;
}

function downloadText(content, mime, filename) {
    const blob = new Blob(mime === "application/msword" ? ["﻿", content] : [content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// Download a non-PDF format. PDF is produced by the editor page via window.print().
function exportFile(doc, s, format) {
    if (format === "doc") return downloadText(buildWord(doc, s), "application/msword", exportFilename(doc, s, "doc"));
    if (format === "json") return downloadText(buildJson(doc), "application/json;charset=utf-8", exportFilename(doc, s, "json"));
    return downloadText(buildTxt(doc, s), "text/plain;charset=utf-8", exportFilename(doc, s, "txt"));
}

let __uidSeq = 0;
function uid(prefix) {
    return prefix + Date.now().toString(36) + (++__uidSeq).toString(36) + Math.random().toString(36).slice(2, 5);
}

// Extractor result → editable document (adds ids + flags).
function makeDoc(course) {
    return {
        title: course.title || "",
        source: { courseId: course.id, url: course.url, extractedAt: Date.now() },
        chapters: (course.chapters || []).map((ch) => ({
            id: uid("c"),
            title: ch.title,
            hidden: false,
            lessons: ch.lessons.map((ls) => ({ id: uid("l"), title: ls.title, time: ls.time || "", type: ls.type || "media", hidden: false })),
        })),
    };
}

function countLessons(doc) {
    return (doc.chapters || []).reduce((n, ch) => n + (ch.hidden ? 0 : ch.lessons.filter((l) => !l.hidden).length), 0);
}
