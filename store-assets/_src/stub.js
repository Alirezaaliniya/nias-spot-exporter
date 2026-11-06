// Fake chrome.* + demo data so the real extension pages can be rendered for
// store screenshots. Scene is picked by location.hash.
(() => {
    const scene = location.hash.slice(1);

    const L = (title, time = "", type = "media") => ({ title, time, type });
    const course = {
        id: "demo",
        title: "دوره پیشرفته طراحی رابط کاربری",
        chapters: [
            { title: "شروع دوره", lessons: [L("معرفی دوره و مسیر یادگیری", "06:12"), L("فایل‌ها و منابع دوره", "", "text"), L("نصب و راه‌اندازی ابزارها", "14:40")] },
            { title: "اصول طراحی رابط کاربری", lessons: [L("سلسله‌مراتب بصری", "18:05"), L("رنگ و کنتراست", "21:33"), L("تایپوگرافی فارسی", "16:47"), L("شبکه و فاصله‌گذاری", "12:20"), L("آزمون فصل دوم", "", "exam")] },
            { title: "کار حرفه‌ای با فیگما", lessons: [L("کامپوننت‌ها و واریانت‌ها", "24:10"), L("اتولی‌اوت پیشرفته", "19:55"), L("سیستم طراحی", "27:02")] },
            { title: "پروژه نهایی", lessons: [L("تحلیل نیازمندی‌ها", "11:45"), L("طراحی صفحات اصلی", "32:18"), L("تحویل به برنامه‌نویس", "15:09")] },
        ],
    };

    const names = ["سارا محمدی", "علی رضایی", "مریم حسینی", "رضا کریمی", "زهرا احمدی", "حسین موسوی", "فاطمه جعفری", "محمد صادقی", "نرگس اکبری", "امیر قاسمی", "لیلا رحیمی", "مهدی نوری", "الهام کاظمی", "پویا شریفی", "نازنین عباسی", "کاوه یوسفی", "شیما باقری", "بهرام توکلی", "یاسمن فرهادی", "آرش سلطانی"];
    const rows = names.map((name, i) => ({
        id: "6adb" + (0x7600fc2c5230 + i * 7919).toString(16),
        name,
        tags: i % 6 === 0 ? "VIP" : i % 9 === 0 ? "حضوری" : "",
        courses: 1 + (i % 3 === 0 ? 1 : 0),
        devicesUsed: 1 + (i % 3),
        devicesMax: 3,
        download: [3.05, 0.42, 66.48, 41.34, 0.56, 12.7, 8.31, 1.92][i % 8] + (i % 8 === 1 || i % 8 === 4 ? "G" : "G"),
        view: `${(i * 3) % 11}:${String((i * 17) % 60).padStart(2, "0")}`,
        active: `1405/8/${15 - (i % 14)} ${String(8 + (i % 14)).padStart(2, "0")}:${String((i * 13) % 60).padStart(2, "0")}`,
        created: `1405/${7 + (i % 2)}/${1 + ((i * 5) % 28)} ${String(9 + (i % 12)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}`,
        player: "https://app.spotplayer.ir/demo/" + i + "/",
    }));

    const scan = {
        ok: true,
        courses: [
            { id: "c1", title: "دوره پیشرفته طراحی رابط کاربری", items: 821, size: "43G", expanded: true },
            { id: "c2", title: "پنل کاربری ووکامرس", items: 90, size: "4G", expanded: false },
            { id: "c3", title: "پروژه‌های خلاقانه و کاربردی", items: 85, size: "6G", expanded: false },
            { id: "c4", title: "افزایش سرعت و بهینه‌سازی", items: 0, size: "0B", expanded: false },
        ],
        licenses: scene === "popup-lic" ? { visible: true, total: 752, onPage: 100, pageSize: 100 } : null,
    };

    const theme2 = { theme: "emerald", accent: "#059669", chapterBg: "#ecfdf5", chapterColor: "#064e3b", textColor: "#1f2937", mutedColor: "#6b7280", borderColor: "#d1fae5", pageBg: "#ffffff", lessonStyle: "list", radius: 12 };

    const mem = { local: {}, sync: {} };
    if (scene === "editor2") Object.assign(mem.sync, theme2);
    if (scene === "licenses") mem.local.licenses = { url: "", extractedAt: Date.now(), total: 752, scope: "all", rows };

    const area = (n) => ({
        get: async (k) => {
            if (k && typeof k === "object" && !Array.isArray(k)) return { ...k, ...mem[n] };
            const o = {};
            [].concat(k).forEach((x) => { if (x in mem[n]) o[x] = mem[n][x]; });
            return o;
        },
        set: async (o) => Object.assign(mem[n], o),
    });

    window.chrome = {
        storage: { local: area("local"), sync: area("sync"), onChanged: { addListener() {} } },
        runtime: { getURL: (x) => x, openOptionsPage() {} },
        tabs: { query: async () => [{ id: 1, url: scene === "popup-lic" ? "https://panel.spotplayer.ir/license/" : "https://panel.spotplayer.ir/course/" }], create() {}, update() {} },
        scripting: {
            executeScript: async (o) => {
                if (o.files) return [{}];
                const src = String(o.func);
                if (src.includes("progress")) return [{ result: { running: true, total: 24, done: 17, items: 356 } }];
                if (src.includes("scan")) return [{ result: scan }];
                return [{ result: null }];
            },
        },
    };

    // editor scenes: start with the demo course instead of the built-in sample
    if (scene.startsWith("editor")) {
        window.__demoCourse = course;
        mem.local.doc = null;
    }

    window.addEventListener("load", () => {
        setTimeout(() => {
            if (scene.startsWith("editor") && typeof loadInto === "function") {
                const d = makeDoc(course);
                d.chapters[1].lessons[4].hidden = scene === "editor";
                loadInto(d);
                isSample = false;
                document.getElementById("sampleBadge").classList.add("hidden");
                if (scene === "editor") {
                    selection = new Set([d.chapters[2].lessons[0].id, d.chapters[2].lessons[1].id]);
                    refreshSelectionClasses();
                    const rows = document.querySelectorAll(".nd-ls");
                    rows[4].classList.add("drop-after");
                } else {
                    document.querySelector('.tab[data-tab="style"]').click();
                }
            }
            if (scene === "popup-progress" && typeof startProgress === "function") {
                startProgress("در حال خواندن «دوره پیشرفته طراحی رابط کاربری»…", "بخش", "جلسه پیدا شد");
            }
        }, 300);
    });
})();
