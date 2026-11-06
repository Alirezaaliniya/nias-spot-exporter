// Screenshot compositions. ?s=<n> picks one.
const SHOTS = {
    1: { h: "فهرست جلسات دوره را روی بوم طراحی کنید", p: "جابه‌جایی با کشیدن، ویرایش درجا، انتخاب چندتایی، مخفی‌کردن و واگرد", win: { page: "editor.html#editor", w: 1440, h: 760, scale: 0.78 } },
    2: { h: "طراحی زنده با چند کلیک", p: "طرح‌های رنگی آماده، رنگ دلخواه، فونت، اندازه‌ها و سه نوع چیدمان", win: { page: "editor.html#editor2", w: 1440, h: 760, scale: 0.78 } },
    3: { h: "دوره را انتخاب کنید، بقیه با افزونه", p: "بخش‌های بسته خودکار باز می‌شوند و پیشرفت کار را لحظه‌به‌لحظه می‌بینید", pops: [
        { page: "popup.html#popup", h: 600, cap: "انتخاب دوره" },
        { page: "popup.html#popup-progress", h: 600, cap: "استخراج با نمایش پیشرفت" },
        { page: "popup.html#popup-lic", h: 600, cap: "لایسنس‌ها: یک صفحه یا همه‌ی صفحات" },
    ] },
    4: { h: "خروجی Excel از همه‌ی لایسنس‌ها", p: "جستجو، مرتب‌سازی، انتخاب و ترتیب ستون‌ها — و خروجی Excel، Word، PDF و JSON", win: { page: "licenses.html#licenses", w: 1440, h: 760, scale: 0.78 } },
    5: { h: "خروجی تمیز در هر قالبی", p: "Word · PDF · TXT · JSON — راست‌به‌چپ و آماده‌ی چاپ", win: { page: "outputs.html", w: 1120, h: 600, scale: 1 } },
};

const s = SHOTS[new URLSearchParams(location.search).get("s") || 1];
document.getElementById("h").textContent = s.h;
document.getElementById("p").textContent = s.p;
const stage = document.getElementById("stage");

function frame(page, w, h, scale) {
    const clip = document.createElement("div");
    clip.className = "clip";
    clip.style.width = Math.round(w * scale) + "px";
    clip.style.height = Math.round(h * scale) + "px";
    const f = document.createElement("iframe");
    f.src = page;
    f.width = w;
    f.height = h;
    f.style.transform = `scale(${scale})`;
    clip.append(f);
    return clip;
}

if (s.win) {
    const win = document.createElement("div");
    win.className = "window";
    win.innerHTML = '<div class="bar"><i></i><i></i><i></i></div>';
    win.append(frame(s.win.page, s.win.w, s.win.h, s.win.scale));
    stage.append(win);
} else {
    const row = document.createElement("div");
    row.className = "row";
    for (const p of s.pops) {
        const col = document.createElement("div");
        const box = document.createElement("div");
        box.className = "popup";
        box.append(frame(p.page, 330, p.h, 0.92));
        const cap = document.createElement("div");
        cap.className = "cap";
        cap.textContent = p.cap;
        col.append(box, cap);
        row.append(col);
    }
    stage.append(row);
}
