# nias spot exporter

افزونه‌ی کروم برای استخراج فهرست جلسات دوره‌های **پنل اسپات پلیر**، ویرایش و طراحی آن روی یک
بوم (Canvas) و خروجی گرفتن به **Word، PDF، TXT و JSON**.

## امکانات
- تشخیص خودکار دوره‌های صفحه‌ی «دوره‌ها» (ساختار جدید پنل) و انتخاب دوره در پاپ‌آپ
- باز کردن خودکار دوره/بخش‌های جمع‌شده هنگام استخراج و بازگرداندن صفحه به حالت قبل
- بوم طراحی: جابه‌جایی فصل‌ها و جلسات با کشیدن، انتقال بین فصل‌ها، ویرایش درجا،
  مخفی/حذف/تکثیر، انتخاب چندتایی، ساخت فصل از انتخاب، ادغام فصل‌ها، واگرد/ازنو، زوم
- طراحی زنده: طرح‌های رنگی آماده، رنگ‌ها، فونت، اندازه‌ها، سه چیدمان (کارتی/فهرستی/فشرده)
- خروجی سریع از پاپ‌آپ با آخرین طرح ذخیره‌شده
- **لایسنس‌ها:** خواندن همین صفحه یا همه‌ی صفحات (با رعایت فیلترهای پنل)، جدول قابل جستجو و
  مرتب‌سازی، انتخاب و ترتیب ستون‌ها، خروجی **Excel (.xlsx)**، Word، PDF و JSON

## ساختار
```
manifest.json
icons/                 16/32/48/128
src/page/extractor.js  تزریق‌شونده در پنل (فقط خواندن DOM)
src/shared/settings.js تنظیمات و ذخیره‌سازی
src/shared/render.js   ساخت خروجی‌ها (مشترک بین بوم و پاپ‌آپ)
src/popup/             انتخاب دوره و خروجی سریع
src/shared/licenses.js ستون‌ها و خروجی‌های لایسنس (شامل نویسنده‌ی xlsx بدون کتابخانه)
src/editor/            بوم طراحی (صفحه‌ی تنظیمات افزونه هم همین است)
src/licenses/          جدول و خروجی لایسنس‌ها
```

## نصب برای توسعه
`chrome://extensions` → Developer mode → **Load unpacked** → همین پوشه.

## انتشار در Chrome Web Store
1. `powershell -File pack.ps1` → فایل `dist/nias-spot-exporter-<version>.zip` ساخته می‌شود.
2. در Developer Dashboard آپلود کنید.
3. **Single purpose:** Export your own SpotPlayer panel data (course lesson lists and license lists) as documents.
4. **Permission justifications:**
   - `activeTab` + `scripting`: read the course/license list from the SpotPlayer panel tab, only after the user clicks the extension. No host permissions are requested.
   - `storage`: keep the user's edited document locally and their design preferences.
5. **Data usage:** no user data collected (see `PRIVACY.md`; host it publicly, e.g. a GitHub link, and use it as the Privacy Policy URL).
6. **Remote code:** No.
7. Screenshots must be 1280×800 or 640×400. The small promo tile is 440×280.
