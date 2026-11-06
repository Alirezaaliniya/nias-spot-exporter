// ──────────────────────────────────────────────
// License export: column model + Excel (.xlsx) / Word / print / JSON builders.
// Shared by the popup (quick export) and the licenses page.
// Depends on render.js (esc, downloadText).
// ──────────────────────────────────────────────

const LICENSES_KEY = "licenses";
const LICENSE_COLS_KEY = "licenseCols";

// get(row) → display value; num: true → numeric cell in Excel
const LICENSE_COLUMNS = [
    { key: "name", label: "نام", get: (r) => r.name, width: 28 },
    { key: "tags", label: "تگ‌ها", get: (r) => r.tags, width: 16 },
    { key: "courses", label: "تعداد دوره", get: (r) => r.courses, num: true, width: 11 },
    { key: "courseNames", label: "دوره‌ها", get: (r) => (r.courseNames || []).join("، "), width: 30 },
    { key: "devices", label: "دستگاه (فعال از سقف)", get: (r) => `${r.devicesUsed} از ${r.devicesMax}`, width: 18 },
    { key: "devicesUsed", label: "دستگاه فعال", get: (r) => r.devicesUsed, num: true, width: 11 },
    { key: "devicesMax", label: "سقف دستگاه", get: (r) => r.devicesMax, num: true, width: 11 },
    { key: "download", label: "دانلود", get: (r) => r.download, width: 11 },
    { key: "view", label: "مشاهده", get: (r) => r.view, width: 10 },
    { key: "active", label: "آخرین فعالیت", get: (r) => r.active, width: 17 },
    { key: "created", label: "تاریخ ایجاد", get: (r) => r.created, width: 17 },
    { key: "player", label: "لینک پخش", get: (r) => r.player, width: 40 },
    { key: "id", label: "شناسه", get: (r) => r.id, width: 26 },
];

const DEFAULT_LICENSE_COLS = ["name", "tags", "courses", "devices", "download", "view", "active", "created"].map((key) => ({ key, on: true }))
    .concat(["courseNames", "devicesUsed", "devicesMax", "player", "id"].map((key) => ({ key, on: false })));

const columnByKey = (k) => LICENSE_COLUMNS.find((c) => c.key === k);

// Stored order/visibility merged with any columns added in later versions.
async function loadLicenseCols() {
    const { [LICENSE_COLS_KEY]: saved } = await chrome.storage.sync.get(LICENSE_COLS_KEY);
    const list = Array.isArray(saved) ? saved.filter((c) => columnByKey(c.key)) : [];
    for (const d of DEFAULT_LICENSE_COLS) if (!list.some((c) => c.key === d.key)) list.push({ ...d });
    return list;
}

const activeColumns = (cols) => cols.filter((c) => c.on).map((c) => columnByKey(c.key));

function licenseFilename(data, ext) {
    const d = new Date(data.extractedAt || Date.now());
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return `licenses-${stamp}.${ext}`;
}

function licenseTableHtml(rows, columns) {
    const head = `<tr><th>#</th>${columns.map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr>`;
    const body = rows
        .map((r, i) => `<tr><td>${i + 1}</td>${columns.map((c) => `<td>${esc(c.get(r))}</td>`).join("")}</tr>`)
        .join("");
    return `<table class="lic-table"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

const LICENSE_TABLE_CSS = `
.lic-table { width:100%; border-collapse:collapse; font-family:Tahoma,"Segoe UI",sans-serif; font-size:11px; direction:rtl; }
.lic-table th { background:#eef2ff; color:#312e81; font-weight:700; }
.lic-table th, .lic-table td { border:1px solid #d9dce3; padding:5px 7px; text-align:right; vertical-align:top; }
.lic-table tr:nth-child(even) td { background:#f8f9fc; }
.lic-title { font-family:Tahoma,sans-serif; font-size:16px; font-weight:700; margin:0 0 4px; direction:rtl; }
.lic-sub { font-family:Tahoma,sans-serif; font-size:11px; color:#6b7280; margin:0 0 12px; direction:rtl; }`;

function licenseHeaderHtml(data, count) {
    const when = new Date(data.extractedAt || Date.now()).toLocaleString("fa-IR");
    return `<div class="lic-title">فهرست لایسنس‌ها</div><div class="lic-sub">${count} لایسنس · ${esc(when)}</div>`;
}

function buildLicenseWord(data, rows, columns) {
    return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>licenses</title>
<style>@page Section1 { size:29.7cm 21cm; mso-page-orientation:landscape; margin:1.5cm; } div.Section1 { page:Section1; } ${LICENSE_TABLE_CSS}</style>
</head><body dir="rtl"><div class="Section1">${licenseHeaderHtml(data, rows.length)}${licenseTableHtml(rows, columns)}</div></body></html>`;
}

function buildLicenseJson(data, rows) {
    return JSON.stringify({ extractedAt: new Date(data.extractedAt).toISOString(), source: data.url, count: rows.length, licenses: rows }, null, 2);
}

// ───────────── minimal XLSX writer (stored zip, inline strings) ─────────────
const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function zipStore(files) {
    const enc = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    for (const f of files) {
        const name = enc.encode(f.name);
        const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
        const crc = crc32(data);
        const local = new DataView(new ArrayBuffer(30));
        local.setUint32(0, 0x04034b50, true);
        local.setUint16(4, 20, true);
        local.setUint16(6, 0x0800, true); // UTF-8 names
        local.setUint16(8, 0, true);      // stored
        local.setUint16(10, 0, true);
        local.setUint16(12, 0x21, true);  // 1980-01-01
        local.setUint32(14, crc, true);
        local.setUint32(18, data.length, true);
        local.setUint32(22, data.length, true);
        local.setUint16(26, name.length, true);
        parts.push(new Uint8Array(local.buffer), name, data);

        const cd = new DataView(new ArrayBuffer(46));
        cd.setUint32(0, 0x02014b50, true);
        cd.setUint16(4, 20, true);
        cd.setUint16(6, 20, true);
        cd.setUint16(8, 0x0800, true);
        cd.setUint16(10, 0, true);
        cd.setUint16(12, 0, true);
        cd.setUint16(14, 0x21, true);
        cd.setUint32(16, crc, true);
        cd.setUint32(20, data.length, true);
        cd.setUint32(24, data.length, true);
        cd.setUint16(28, name.length, true);
        cd.setUint32(42, offset, true);
        central.push(new Uint8Array(cd.buffer), name);
        offset += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((n, p) => n + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
}

const xmlEsc = (s) =>
    String(s ?? "")
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function colRef(i) {
    let s = "";
    for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    return s;
}

function buildLicenseXlsx(rows, columns) {
    const cell = (ref, v, num, style) =>
        num && v !== "" && v != null && !isNaN(v)
            ? `<c r="${ref}"${style}><v>${Number(v)}</v></c>`
            : `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;

    const all = [{ label: "#", get: (_, i) => i + 1, num: true, width: 6 }, ...columns];
    const header = `<row r="1">${all.map((c, i) => cell(colRef(i) + "1", c.label, false, ' s="1"')).join("")}</row>`;
    const body = rows
        .map((r, ri) => `<row r="${ri + 2}">${all.map((c, ci) => cell(colRef(ci) + (ri + 2), c.get(r, ri), c.num, "")).join("")}</row>`)
        .join("");
    const cols = `<cols>${all.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || 14}" customWidth="1"/>`).join("")}</cols>`;
    const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    const RNS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

    return zipStore([
        { name: "[Content_Types].xml", data: `${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
        { name: "_rels/.rels", data: `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
        { name: "xl/workbook.xml", data: `${head}<workbook ${NS} ${RNS}><sheets><sheet name="Licenses" sheetId="1" r:id="rId1"/></sheets></workbook>` },
        { name: "xl/_rels/workbook.xml.rels", data: `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
        { name: "xl/styles.xml", data: `${head}<styleSheet ${NS}><fonts count="2"><font><sz val="11"/><name val="Tahoma"/></font><font><b/><sz val="11"/><color rgb="FF312E81"/><name val="Tahoma"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEEF2FF"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
        { name: "xl/worksheets/sheet1.xml", data: `${head}<worksheet ${NS} ${RNS}><sheetViews><sheetView workbookViewId="0" rightToLeft="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${header}${body}</sheetData></worksheet>` },
    ]);
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// Non-PDF license export (PDF is printed by the licenses page).
function exportLicenses(data, rows, columns, format) {
    if (format === "xlsx") return downloadBlob(buildLicenseXlsx(rows, columns), licenseFilename(data, "xlsx"));
    if (format === "doc") return downloadText(buildLicenseWord(data, rows, columns), "application/msword", licenseFilename(data, "doc"));
    return downloadText(buildLicenseJson(data, rows), "application/json;charset=utf-8", licenseFilename(data, "json"));
}
