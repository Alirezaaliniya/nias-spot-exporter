// ──────────────────────────────────────────────
// Canvas editor: reorder (drag & drop), rename, hide, delete, group lessons,
// style the document live, then export Word / PDF / TXT / JSON.
// Every mutation goes through commit() → undo history + render + autosave.
// ──────────────────────────────────────────────

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const CONTENT_KEYS = new Set(["showDocTitle", "showChapterPrefix", "chapterPrefix", "numbering", "numberingMode", "showTime", "timeLabel", "emoji"]);
const STYLE_KEYS = ["theme", "fontFamily", "baseSize", "chapterSize", "titleSize", "lessonStyle", "radius", "spacing", "accent", "chapterBg", "chapterColor", "textColor", "mutedColor", "borderColor", "pageBg"];
const TYPE_LABEL = { text: "متن", exam: "آزمون", custom: "دستی" };

const ICONS = {
    eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24"><path d="M9.9 4.2A10 10 0 0 1 12 4c6.5 0 10 8 10 8a17 17 0 0 1-2.2 3.2M6.6 6.6A17 17 0 0 0 2 12s3.5 8 10 8a9.7 9.7 0 0 0 5.4-1.6"/><path d="m2 2 20 20"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    merge: '<svg viewBox="0 0 24 24"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>',
};

let S = { ...DEFAULT_SETTINGS };
let doc = null;
let original = null;
let isSample = false;
let lastSavedJson = "";
const collapsed = new Set();
let selection = new Set();
let anchorId = null;
const undoStack = [];
const redoStack = [];
let zoom = parseFloat(localStorage.getItem("nias.zoom")) || 1;

// ───────────────────────── helpers ─────────────────────────
function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
}

function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove("show"), 2200);
}

const findChapter = (id) => doc.chapters.find((c) => c.id === id);

function findLesson(id) {
    for (const ch of doc.chapters) {
        const i = ch.lessons.findIndex((l) => l.id === id);
        if (i > -1) return { ch, i, ls: ch.lessons[i] };
    }
    return null;
}

const allLessonIds = () => doc.chapters.flatMap((ch) => ch.lessons.map((l) => l.id));
const orderedSelection = () => allLessonIds().filter((id) => selection.has(id));

function sampleDoc() {
    return makeDoc({
        title: "نمونه دوره آموزشی",
        chapters: [
            { title: "مقدمه", lessons: [{ title: "معرفی دوره", time: "05:12" }, { title: "پیش‌نیازها", time: "08:40" }, { title: "فایل‌های دوره", type: "text" }] },
            { title: "مفاهیم پایه", lessons: [{ title: "نصب ابزارها", time: "14:05" }, { title: "اولین پروژه", time: "22:31" }, { title: "آزمون فصل", type: "exam" }] },
        ],
    });
}

// ───────────────────────── history / persistence ─────────────────────────
function commit(fn) {
    undoStack.push(JSON.stringify(doc));
    if (undoStack.length > 150) undoStack.shift();
    redoStack.length = 0;
    fn();
    afterChange();
}

function afterChange() {
    if (isSample) {
        isSample = false;
        $("#sampleBadge").classList.add("hidden");
    }
    pruneSelection();
    render();
    scheduleSave();
}

function undo() {
    if (!undoStack.length) return;
    redoStack.push(JSON.stringify(doc));
    doc = JSON.parse(undoStack.pop());
    afterChange();
}

function redo() {
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify(doc));
    doc = JSON.parse(redoStack.pop());
    afterChange();
}

function updateUndoButtons() {
    $("#undo").disabled = !undoStack.length;
    $("#redo").disabled = !redoStack.length;
}

let saveTimer = null;
function scheduleSave() {
    const st = $("#savedState");
    st.textContent = "در حال ذخیره…";
    st.classList.add("dirty");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 400);
}

async function flushSave() {
    clearTimeout(saveTimer);
    lastSavedJson = JSON.stringify(doc);
    await saveDoc(doc);
    const st = $("#savedState");
    st.textContent = "ذخیره شد";
    st.classList.remove("dirty");
}

let settingsTimer = null;
function scheduleSettingsSave() {
    clearTimeout(settingsTimer);
    settingsTimer = setTimeout(() => saveSettings(S), 600); // sync storage has write quotas
}

function pruneSelection() {
    const ids = new Set(allLessonIds());
    selection = new Set([...selection].filter((id) => ids.has(id)));
}

// ───────────────────────── rendering ─────────────────────────
function applyStyle() {
    $("#docStyle").textContent = docCss(S, ".nias-doc");
}

function handle() {
    const h = el("span", "handle", "⋮⋮");
    h.title = "بکشید برای جابه‌جایی";
    return h;
}

function tools(acts) {
    const t = el("div", "tools");
    for (const [act, icon, title, cls] of acts) {
        const b = el("button", cls || "");
        b.dataset.act = act;
        b.title = title;
        b.innerHTML = ICONS[icon];
        t.append(b);
    }
    return t;
}

function lessonRow(ls, nums) {
    const r = el("div", "nd-ls");
    r.dataset.id = ls.id;
    r.draggable = true;
    if (ls.hidden) r.classList.add("is-hidden");
    if (selection.has(ls.id)) r.classList.add("selected");

    r.append(handle());
    const num = nums.get(ls.id);
    if (num) r.append(el("span", "nd-num", num));
    const tt = el("span", "nd-tt", ls.title);
    tt.dataset.edit = "title";
    r.append(tt);
    if (TYPE_LABEL[ls.type]) r.append(el("span", "type " + ls.type, TYPE_LABEL[ls.type]));
    const meta = lessonMeta(ls, S);
    if (meta) {
        const m = el("span", "nd-mt", meta);
        m.dataset.edit = "time";
        r.append(m);
    }
    r.append(tools([
        ["hide", ls.hidden ? "eyeOff" : "eye", ls.hidden ? "نمایش در خروجی" : "مخفی از خروجی"],
        ["dup", "copy", "تکثیر"],
        ["del", "trash", "حذف", "del"],
    ]));
    return r;
}

function render() {
    const nums = numberMap(doc, S);
    const prefix = chapterLabelPrefix(S);
    const frag = document.createDocumentFragment();

    if (S.showDocTitle) {
        const t = el("div", "nd-title", doc.title || "بدون عنوان");
        t.dataset.edit = "doc";
        frag.append(t);
    }

    doc.chapters.forEach((ch, ci) => {
        const c = el("div", "nd-ch");
        c.dataset.id = ch.id;
        if (ch.hidden) c.classList.add("is-hidden");
        const isCollapsed = collapsed.has(ch.id);
        if (isCollapsed) c.classList.add("collapsed");

        const h = el("div", "nd-ch-h");
        h.draggable = true;
        const caret = el("span", "caret", "▾");
        caret.title = isCollapsed ? "باز کردن" : "جمع کردن";
        const t = el("span", "t", ch.title);
        t.dataset.edit = "chapter";
        const acts = [
            ["hide", ch.hidden ? "eyeOff" : "eye", ch.hidden ? "نمایش فصل" : "مخفی کردن فصل"],
            ["add", "plus", "افزودن جلسه"],
        ];
        if (ci > 0) acts.push(["merge", "merge", "ادغام با فصل قبلی"]);
        acts.push(["del", "trash", "حذف فصل", "del"]);
        h.append(handle(), caret, prefix ? el("span", "p", prefix) : "", t, el("span", "count-chip", `${ch.lessons.length} جلسه`), tools(acts));
        c.append(h);

        const body = el("div", "nd-ch-body");
        if (isCollapsed) {
            body.append(el("div", "collapsed-note", `${ch.lessons.length} جلسه — جمع شده`));
        } else {
            for (const ls of ch.lessons) body.append(lessonRow(ls, nums));
            const add = el("button", "add-lesson", "+ افزودن جلسه");
            add.dataset.act = "add";
            body.append(add);
        }
        c.append(body);
        frag.append(c);
    });

    $("#paper").replaceChildren(frag);
    if (document.activeElement !== $("#docTitle")) $("#docTitle").value = doc.title || "";
    renderStats();
    renderMoveTo();
    updateSelbar();
    updateUndoButtons();
}

function parseDuration(t) {
    const p = String(t || "").split(":").map((x) => parseInt(x, 10));
    if (!p.length || p.some(isNaN)) return 0;
    return p.reduce((acc, v) => acc * 60 + v, 0);
}

function renderStats() {
    let visible = 0, hidden = 0, secs = 0;
    for (const ch of doc.chapters)
        for (const ls of ch.lessons) {
            if (ls.hidden || ch.hidden) hidden++;
            else { visible++; secs += parseDuration(ls.time); }
        }
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
    const items = [
        [doc.chapters.length, "فصل"],
        [visible, "جلسه در خروجی"],
        [hidden, "مخفی"],
    ];
    if (secs) items.push([`${h}:${String(m).padStart(2, "0")}`, "مدت کل (ساعت)"]);
    $("#stats").replaceChildren(...items.map(([v, l]) => {
        const d = el("div", "stat");
        d.append(el("b", "", String(v)), el("span", "", l));
        return d;
    }));
}

function renderMoveTo() {
    const sel = $("#moveTo");
    sel.replaceChildren(el("option", "", "انتقال به فصل…"));
    sel.firstChild.value = "";
    for (const ch of doc.chapters) {
        const o = el("option", "", ch.title || "بدون عنوان");
        o.value = ch.id;
        sel.append(o);
    }
}

function updateSelbar() {
    $("#selbar").classList.toggle("hidden", !selection.size);
    $("#selCount").textContent = `${selection.size} جلسه`;
}

function refreshSelectionClasses() {
    $$(".nd-ls").forEach((r) => r.classList.toggle("selected", selection.has(r.dataset.id)));
    updateSelbar();
}

// ───────────────────────── mutations ─────────────────────────
function newChapter(title = "فصل جدید") {
    return { id: uid("c"), title, hidden: false, lessons: [] };
}

function addLesson(chId) {
    const ch = findChapter(chId);
    if (!ch) return;
    const ls = { id: uid("l"), title: "جلسه جدید", time: "", type: "custom", hidden: false };
    collapsed.delete(chId);
    commit(() => ch.lessons.push(ls));
    editById(ls.id, "title");
}

function removeLessons(ids) {
    const set = new Set(ids);
    for (const ch of doc.chapters) ch.lessons = ch.lessons.filter((l) => !set.has(l.id));
}

function moveLessons(ids, chId, refId = null, before = true) {
    const moving = ids.map((id) => findLesson(id)?.ls).filter(Boolean);
    if (!moving.length) return;
    removeLessons(ids);
    const ch = findChapter(chId);
    let idx = ch.lessons.length;
    if (refId === "start") idx = 0;
    else if (refId) {
        const i = ch.lessons.findIndex((l) => l.id === refId);
        if (i > -1) idx = before ? i : i + 1;
    }
    ch.lessons.splice(idx, 0, ...moving);
}

function moveChapter(id, refId, before) {
    const i = doc.chapters.findIndex((c) => c.id === id);
    const [ch] = doc.chapters.splice(i, 1);
    let j = doc.chapters.findIndex((c) => c.id === refId);
    if (!before) j++;
    doc.chapters.splice(j, 0, ch);
}

function lessonAction(act, id) {
    const f = findLesson(id);
    if (!f) return;
    if (act === "hide") commit(() => (f.ls.hidden = !f.ls.hidden));
    else if (act === "dup") commit(() => f.ch.lessons.splice(f.i + 1, 0, { ...f.ls, id: uid("l") }));
    else if (act === "del") {
        commit(() => f.ch.lessons.splice(f.i, 1));
        toast("حذف شد — Ctrl+Z برای واگرد");
    }
}

function chapterAction(act, id) {
    const ci = doc.chapters.findIndex((c) => c.id === id);
    const ch = doc.chapters[ci];
    if (!ch) return;
    if (act === "hide") commit(() => (ch.hidden = !ch.hidden));
    else if (act === "add") addLesson(id);
    else if (act === "merge" && ci > 0) {
        commit(() => {
            doc.chapters[ci - 1].lessons.push(...ch.lessons);
            doc.chapters.splice(ci, 1);
        });
        toast("با فصل قبلی ادغام شد");
    } else if (act === "del") {
        commit(() => doc.chapters.splice(ci, 1));
        toast(`فصل و ${ch.lessons.length} جلسه حذف شد — Ctrl+Z برای واگرد`);
    }
}

// ───────────────────────── inline editing ─────────────────────────
function editById(id, kind) {
    const node = $(`.nd-ls[data-id="${CSS.escape(id)}"] [data-edit="${kind}"]`) || $(`.nd-ch[data-id="${CSS.escape(id)}"] [data-edit="${kind}"]`);
    if (node) startEdit(node);
}

function startEdit(node) {
    const kind = node.dataset.edit;
    const lessonEl = node.closest(".nd-ls");
    const chapterEl = node.closest(".nd-ch");
    const dragEl = node.closest("[draggable]");
    if (dragEl) dragEl.draggable = false;

    let raw = node.textContent;
    if (kind === "doc") raw = doc.title || "";
    if (kind === "time") raw = findLesson(lessonEl.dataset.id)?.ls.time || "";
    node.textContent = raw;
    node.contentEditable = "plaintext-only";
    node.focus();
    const range = document.createRange();
    range.selectNodeContents(node);
    getSelection().removeAllRanges();
    getSelection().addRange(range);

    let done = false;
    const finish = (save) => {
        if (done) return;
        done = true;
        node.contentEditable = "false";
        const v = node.textContent.replace(/\s+/g, " ").trim();
        if (!save || v === raw.trim() || (!v && kind !== "time")) return render();
        commit(() => {
            if (kind === "doc") doc.title = v;
            else if (kind === "chapter") findChapter(chapterEl.dataset.id).title = v;
            else if (kind === "title") findLesson(lessonEl.dataset.id).ls.title = v;
            else if (kind === "time") findLesson(lessonEl.dataset.id).ls.time = v;
        });
    };
    node.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); finish(true); }
        else if (e.key === "Escape") { e.preventDefault(); finish(false); }
        e.stopPropagation();
    });
    node.addEventListener("blur", () => finish(true), { once: true });
}

// ───────────────────────── canvas events ─────────────────────────
const paper = () => $("#paper");

function onPaperClick(e) {
    if (e.target.isContentEditable) return;
    const actBtn = e.target.closest("[data-act]");
    if (actBtn) {
        const chEl = actBtn.closest(".nd-ch");
        const lsEl = actBtn.closest(".nd-ls");
        if (lsEl) lessonAction(actBtn.dataset.act, lsEl.dataset.id);
        else if (chEl) chapterAction(actBtn.dataset.act, chEl.dataset.id);
        return;
    }
    if (e.target.closest(".caret")) {
        const id = e.target.closest(".nd-ch").dataset.id;
        collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id);
        return render();
    }
    const row = e.target.closest(".nd-ls");
    if (!row) {
        if (!e.target.closest(".nd-ch-h")) {
            selection.clear();
            refreshSelectionClasses();
        }
        return;
    }
    const id = row.dataset.id;
    if (e.shiftKey && anchorId) {
        const ids = allLessonIds();
        const [a, b] = [ids.indexOf(anchorId), ids.indexOf(id)].sort((x, y) => x - y);
        if (a > -1) ids.slice(a, b + 1).forEach((x) => selection.add(x));
    } else if (e.ctrlKey || e.metaKey) {
        selection.has(id) ? selection.delete(id) : selection.add(id);
        anchorId = id;
    } else {
        selection = new Set([id]);
        anchorId = id;
    }
    refreshSelectionClasses();
}

function onPaperDblClick(e) {
    const node = e.target.closest("[data-edit]");
    if (node && !node.isContentEditable) startEdit(node);
}

// ── drag & drop ──
let drag = null;
let dropTarget = null;

function clearDropMarks() {
    $$(".drop-before, .drop-after, .drop-into").forEach((n) => n.classList.remove("drop-before", "drop-after", "drop-into"));
}

function computeTarget(e) {
    const above = (node) => {
        const r = node.getBoundingClientRect();
        return e.clientY < r.top + r.height / 2;
    };
    if (drag.kind === "lesson") {
        const row = e.target.closest(".nd-ls");
        if (row) {
            if (drag.ids.includes(row.dataset.id)) return null;
            const before = above(row);
            return { el: row, cls: before ? "drop-before" : "drop-after", chId: row.closest(".nd-ch").dataset.id, refId: row.dataset.id, before };
        }
        const chEl = e.target.closest(".nd-ch");
        if (!chEl) return null;
        const onHead = !!e.target.closest(".nd-ch-h");
        return { el: chEl.querySelector(".nd-ch-body"), cls: "drop-into", chId: chEl.dataset.id, refId: onHead ? "start" : null };
    }
    const chEl = e.target.closest(".nd-ch");
    if (!chEl || chEl.dataset.id === drag.id) return null;
    const before = above(chEl);
    return { el: chEl, cls: before ? "drop-before" : "drop-after", refId: chEl.dataset.id, before };
}

function onDragStart(e) {
    if (e.target.isContentEditable || e.target.closest?.("[contenteditable='plaintext-only']")) return e.preventDefault();
    const row = e.target.closest?.(".nd-ls");
    const head = e.target.closest?.(".nd-ch-h");
    if (row) {
        const id = row.dataset.id;
        const ids = selection.has(id) ? orderedSelection() : [id];
        drag = { kind: "lesson", ids };
        requestAnimationFrame(() => ids.forEach((x) => $(`.nd-ls[data-id="${CSS.escape(x)}"]`)?.classList.add("dragging")));
    } else if (head) {
        drag = { kind: "chapter", id: head.parentElement.dataset.id };
        requestAnimationFrame(() => head.parentElement.classList.add("dragging"));
    } else return;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "nias-drag");
}

function onDragOver(e) {
    if (!drag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    // auto-scroll near the canvas edges
    const cv = $("#canvas").getBoundingClientRect();
    if (e.clientY < cv.top + 60) $("#canvas").scrollBy(0, -18);
    else if (e.clientY > cv.bottom - 60) $("#canvas").scrollBy(0, 18);

    const t = computeTarget(e);
    if (t?.el === dropTarget?.el && t?.cls === dropTarget?.cls) return;
    clearDropMarks();
    dropTarget = t;
    if (t) t.el.classList.add(t.cls);
}

function onDrop(e) {
    e.preventDefault();
    const d = drag, t = dropTarget;
    endDrag();
    if (!d || !t) return;
    if (d.kind === "lesson") {
        collapsed.delete(t.chId);
        commit(() => moveLessons(d.ids, t.chId, t.refId, t.before));
    } else {
        commit(() => moveChapter(d.id, t.refId, t.before));
    }
}

function endDrag() {
    clearDropMarks();
    $$(".dragging").forEach((n) => n.classList.remove("dragging"));
    drag = null;
    dropTarget = null;
}

// ───────────────────────── selection bar ─────────────────────────
function selectionAction(act) {
    const ids = orderedSelection();
    if (act === "clear") {
        selection.clear();
        return refreshSelectionClasses();
    }
    if (!ids.length) return;
    if (act === "delete") {
        commit(() => removeLessons(ids));
        toast(`${ids.length} جلسه حذف شد — Ctrl+Z برای واگرد`);
    } else if (act === "toggle") {
        const allHidden = ids.every((id) => findLesson(id).ls.hidden);
        commit(() => ids.forEach((id) => (findLesson(id).ls.hidden = !allHidden)));
    } else if (act === "group") {
        const first = findLesson(ids[0]);
        const ch = newChapter();
        commit(() => {
            const at = doc.chapters.indexOf(first.ch);
            doc.chapters.splice(at + 1, 0, ch);
            moveLessons(ids, ch.id);
        });
        editById(ch.id, "chapter");
    }
}

function moveSelectionBy(dir) {
    if (selection.size !== 1) return;
    const [id] = selection;
    const f = findLesson(id);
    const ci = doc.chapters.indexOf(f.ch);
    commit(() => {
        const j = f.i + dir;
        if (j >= 0 && j < f.ch.lessons.length) {
            [f.ch.lessons[f.i], f.ch.lessons[j]] = [f.ch.lessons[j], f.ch.lessons[f.i]];
        } else if (doc.chapters[ci + dir]) {
            f.ch.lessons.splice(f.i, 1);
            const target = doc.chapters[ci + dir];
            collapsed.delete(target.id);
            dir < 0 ? target.lessons.push(f.ls) : target.lessons.unshift(f.ls);
        }
    });
    $(`.nd-ls[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" });
}

// ───────────────────────── settings panel ─────────────────────────
function setSetting(key, value) {
    S[key] = value;
    if (["accent", "chapterBg", "chapterColor", "textColor", "mutedColor", "borderColor", "pageBg"].includes(key)) S.theme = "custom";
    applyStyle();
    if (CONTENT_KEYS.has(key)) render();
    syncControls();
    scheduleSettingsSave();
}

function buildPanel() {
    const themes = $("#themes");
    for (const [name, t] of Object.entries(THEMES)) {
        const b = el("button", "theme");
        b.dataset.theme = name;
        b.title = name;
        b.style.background = t.chapterBg;
        b.style.setProperty("--sw-accent", t.accent);
        b.addEventListener("click", () => {
            Object.assign(S, t, { theme: name });
            applyStyle();
            syncControls();
            scheduleSettingsSave();
        });
        themes.append(b);
    }

    const fontSel = $("#fontSelect");
    for (const f of Object.keys(FONTS)) {
        const o = el("option", "", f);
        o.value = f;
        o.style.fontFamily = FONTS[f];
        fontSel.append(o);
    }

    $$("[data-key]").forEach((ctrl) => {
        const k = ctrl.dataset.key;
        if (ctrl.classList.contains("segmented")) {
            ctrl.addEventListener("click", (e) => {
                const b = e.target.closest("button[data-value]");
                if (b) setSetting(k, b.dataset.value);
            });
        } else if (ctrl.type === "checkbox") {
            ctrl.addEventListener("change", () => setSetting(k, ctrl.checked));
        } else if (ctrl.type === "range") {
            ctrl.addEventListener("input", () => setSetting(k, Number(ctrl.value)));
        } else {
            ctrl.addEventListener("input", () => setSetting(k, ctrl.value));
        }
    });

    $$(".tab").forEach((tab) =>
        tab.addEventListener("click", () => {
            $$(".tab").forEach((t) => t.classList.toggle("active", t === tab));
            $$(".pane").forEach((p) => p.classList.toggle("hidden", p.dataset.pane !== tab.dataset.tab));
        })
    );

    $("#resetStyle").addEventListener("click", () => {
        for (const k of STYLE_KEYS) S[k] = DEFAULT_SETTINGS[k];
        applyStyle();
        syncControls();
        scheduleSettingsSave();
        toast("طراحی پیش‌فرض بازگردانی شد");
    });
}

function syncControls() {
    $$("[data-key]").forEach((ctrl) => {
        const k = ctrl.dataset.key;
        const v = S[k];
        if (ctrl.classList.contains("segmented")) {
            $$("button", ctrl).forEach((b) => b.classList.toggle("active", b.dataset.value === v));
        } else if (ctrl.type === "checkbox") {
            ctrl.checked = !!v;
        } else if (document.activeElement !== ctrl || ctrl.type === "range") {
            if (ctrl.value !== String(v)) ctrl.value = v;
        }
        if (ctrl.type === "range") ctrl.parentElement.querySelector("output").textContent = v;
        const dep = ctrl.dataset.depends;
        if (dep) {
            const off = !S[dep];
            ctrl.classList.contains("segmented") ? ctrl.classList.toggle("disabled", off) : (ctrl.disabled = off);
        }
    });
    $$(".theme").forEach((b) => b.classList.toggle("active", b.dataset.theme === S.theme));
}

// ───────────────────────── tools pane ─────────────────────────
function bindTools() {
    $("#addChapter").addEventListener("click", () => {
        const ch = newChapter();
        commit(() => doc.chapters.push(ch));
        editById(ch.id, "chapter");
        $(`.nd-ch[data-id="${CSS.escape(ch.id)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    $("#collapseAll").addEventListener("click", () => {
        doc.chapters.forEach((c) => collapsed.add(c.id));
        render();
    });
    $("#expandAll").addEventListener("click", () => {
        collapsed.clear();
        render();
    });
    $$("[data-clean]").forEach((b) =>
        b.addEventListener("click", () => {
            const kind = b.dataset.clean;
            let n = 0;
            commit(() => {
                if (kind === "empty") {
                    const before = doc.chapters.length;
                    doc.chapters = doc.chapters.filter((c) => c.lessons.length);
                    n = before - doc.chapters.length;
                } else if (kind === "unhide") {
                    doc.chapters.forEach((c) => {
                        if (c.hidden) n++;
                        c.hidden = false;
                        c.lessons.forEach((l) => { if (l.hidden) n++; l.hidden = false; });
                    });
                } else {
                    doc.chapters.forEach((c) => {
                        const before = c.lessons.length;
                        c.lessons = c.lessons.filter((l) => l.type !== kind);
                        n += before - c.lessons.length;
                    });
                }
            });
            toast(n ? `${n} مورد تغییر کرد` : "موردی پیدا نشد");
        })
    );
    $("#resetDoc").addEventListener("click", () => {
        if (!original) return toast("نسخه‌ی استخراج‌شده‌ای وجود ندارد");
        if (!confirm("همه‌ی تغییرات سند کنار گذاشته شود و نسخه‌ی اصلی استخراج‌شده بازگردد؟")) return;
        commit(() => (doc = JSON.parse(JSON.stringify(original))));
        collapsed.clear();
    });
}

// ───────────────────────── export ─────────────────────────
function fillPrintArea() {
    $("#printArea").innerHTML = docBodyHtml(doc, S); // all values escaped by render.js
}

function printDoc() {
    fillPrintArea();
    const prevTitle = document.title;
    document.title = exportFilename(doc, S, "pdf").replace(/\.pdf$/, "");
    window.addEventListener("afterprint", () => (document.title = prevTitle), { once: true });
    window.print();
}

function doExport(format) {
    if (!countLessons(doc)) return toast("سند خالی است");
    if (format === "pdf") return printDoc();
    exportFile(doc, S, format);
    toast("فایل دانلود شد");
}

// ───────────────────────── zoom ─────────────────────────
function setZoom(z) {
    zoom = Math.min(2, Math.max(0.4, Math.round(z * 100) / 100));
    paper().style.zoom = zoom;
    $("#zoomReset").textContent = Math.round(zoom * 100) + "%";
    localStorage.setItem("nias.zoom", String(zoom));
}

// ───────────────────────── keyboard ─────────────────────────
function onKey(e) {
    const typing = e.target.closest?.("input, select, textarea, [contenteditable='plaintext-only']");
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    if (mod && key === "s") {
        e.preventDefault();
        flushSave().then(() => toast("ذخیره شد"));
        return;
    }
    if (typing) return;

    if (mod && key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (mod && (key === "y" || (key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
    else if (mod && key === "a") {
        e.preventDefault();
        selection = new Set(allLessonIds());
        refreshSelectionClasses();
    } else if ((e.key === "Delete" || e.key === "Backspace") && selection.size) {
        e.preventDefault();
        selectionAction("delete");
    } else if (e.key === "Escape") {
        selection.clear();
        refreshSelectionClasses();
    } else if (e.key === "F2" && selection.size === 1) {
        e.preventDefault();
        editById([...selection][0], "title");
    } else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        moveSelectionBy(e.key === "ArrowUp" ? -1 : 1);
    }
}

// ───────────────────────── init ─────────────────────────
function loadInto(d) {
    doc = d;
    undoStack.length = 0;
    redoStack.length = 0;
    selection.clear();
    collapsed.clear();
    render();
}

(async () => {
    S = await loadSettings();
    const stored = await loadDoc();
    original = stored.original;
    if (stored.doc) {
        lastSavedJson = JSON.stringify(stored.doc);
        loadInto(stored.doc);
    } else {
        isSample = true;
        $("#sampleBadge").classList.remove("hidden");
        loadInto(sampleDoc());
    }

    buildPanel();
    bindTools();
    applyStyle();
    syncControls();
    setZoom(zoom);
    render();

    const p = paper();
    p.addEventListener("click", onPaperClick);
    p.addEventListener("dblclick", onPaperDblClick);
    p.addEventListener("dragstart", onDragStart);
    p.addEventListener("dragover", onDragOver);
    p.addEventListener("drop", onDrop);
    p.addEventListener("dragend", endDrag);

    $("#canvas").addEventListener("wheel", (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        setZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
    }, { passive: false });
    $("#zoomIn").addEventListener("click", () => setZoom(zoom + 0.1));
    $("#zoomOut").addEventListener("click", () => setZoom(zoom - 0.1));
    $("#zoomReset").addEventListener("click", () => setZoom(1));
    $("#undo").addEventListener("click", undo);
    $("#redo").addEventListener("click", redo);

    $("#docTitle").addEventListener("change", (e) => {
        const v = e.target.value.trim();
        if (v !== doc.title) commit(() => (doc.title = v));
    });
    $("#docTitle").addEventListener("keydown", (e) => e.key === "Enter" && e.target.blur());

    $$(".ex").forEach((b) => b.addEventListener("click", () => doExport(b.dataset.format)));
    $("#selbar").addEventListener("click", (e) => {
        const b = e.target.closest("[data-sel]");
        if (b) selectionAction(b.dataset.sel);
    });
    $("#moveTo").addEventListener("change", (e) => {
        const chId = e.target.value;
        if (!chId) return;
        const ids = orderedSelection();
        collapsed.delete(chId);
        commit(() => moveLessons(ids, chId));
        toast(`${ids.length} جلسه منتقل شد`);
    });

    document.addEventListener("keydown", onKey);
    window.addEventListener("beforeprint", fillPrintArea);

    // A new course extracted from the popup while this tab is open → load it.
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        if (changes.docOriginal) original = changes.docOriginal.newValue || null;
        const nv = changes.doc?.newValue;
        if (nv && JSON.stringify(nv) !== lastSavedJson) {
            lastSavedJson = JSON.stringify(nv);
            isSample = false;
            $("#sampleBadge").classList.add("hidden");
            loadInto(nv);
            toast("دوره‌ی جدید بارگذاری شد");
        }
    });

    if (location.hash === "#print") {
        history.replaceState(null, "", location.pathname);
        setTimeout(printDoc, 350);
    }
})();
