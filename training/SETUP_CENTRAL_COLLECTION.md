# دليل إعداد المجمّع المركزي لبيانات الطلاب

هذا الدليل لتفعيل تدفّق البيانات إلى Google Sheet واحد عند استعدادك. الاختبارات حاليًا معطّلة عن جمع البيانات (`AI_ENABLED = false`).

---

## الخطوة 1 — إنشاء Google Sheet

1. افتح https://sheets.google.com ثم أنشئ ورقة جديدة مثلاً باسم `STAT102 — Training Log`.
2. في الصف الأول اكتب هذه العناوين (من اليسار إلى اليمين):

```
timestamp | student_id | lesson | question_id | skill_id | difficulty | is_correct | attempts | used_help | time_sec | showed_solution
```

---

## الخطوة 2 — إضافة Apps Script

1. من قائمة **Extensions** اختر **Apps Script**.
2. احذف أي كود موجود والصق التالي:

```javascript
const SHEET_NAME = "Sheet1";            // أو اسم الورقة عندك
const SHARED_TOKEN = "CHANGE_ME_SECRET"; // كلمة سر مشتركة مع الموقع

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.token !== SHARED_TOKEN) return jsonOut({ok:false, error:"unauthorized"});
    const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
    const events = Array.isArray(body.events) ? body.events : [body];
    const rows = events.map(ev => [
      ev.timestamp || new Date().toISOString(),
      ev.student_id || "",
      ev.lesson || "",
      ev.question_id || "",
      ev.skill_id || "",
      ev.difficulty || "",
      ev.is_correct ? 1 : 0,
      Number(ev.attempts_count || 1),
      ev.used_help ? 1 : 0,
      Number(ev.time_spent_sec || 0),
      ev.showed_solution ? 1 : 0,
    ]);
    if (rows.length) sheet.getRange(sheet.getLastRow()+1, 1, rows.length, rows[0].length).setValues(rows);
    return jsonOut({ok:true, written: rows.length});
  } catch (err) {
    return jsonOut({ok:false, error: String(err)});
  }
}

function jsonOut(obj){
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

3. استبدل `CHANGE_ME_SECRET` بقيمة خاصة بك (مثلاً `stat102_secret_2026`).
4. اضغط **Deploy** → **New deployment** → اختر **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone** (ضروري حتى يستقبل طلبات بدون مصادقة)
5. انسخ **Web app URL** (يبدأ بـ `https://script.google.com/macros/s/.../exec`).

---

## الخطوة 3 — تفعيل الجمع في الموقع

سيأتي هذا الجزء في تحديث لاحق. عندما يكون عندك الـ URL + SECRET جاهزين، أخبرني بهما (أو ضعهما في إعدادات سرّية) وسأفعّل:

1. `AI_ENABLED = true` في كل ملفات الاختبار.
2. شاشة الدخول بالرقم الجامعي في بداية كل اختبار (قبل "بدء الاختبار").
3. إرسال كل حدث تلقائيًا إلى الـ URL.

---

## الخطوة 4 — تنزيل البيانات دفعة واحدة

في أي وقت:

1. افتح الـ Sheet.
2. **File** → **Download** → **Comma Separated Values (.csv)** أو **JSON** (إضافة).
3. احفظ الملف في `training/data/` ثم شغّل:

```bash
python training/train_lr_bkt.py --input training/data/<your_file>.json
```

سيُدرَّب النموذج وتُحدَّث `models/bkt_model.json` و `models/lr_model.json` تلقائيًا.

---

## الملاحظات الأمنية

- لا تُشارك الـ `SHARED_TOKEN` علنًا — لا تُكتب في README في GitHub.
- يُكتب فقط في ملف جانبي محلي أو متغيّر `secrets` في CI.
- الـ URL لا يكشف البيانات للقراءة العامة (GET فارغ)، فقط POST بالـ token.
- Google Sheets يحتفظ بسجلّ Undo لو أردت حذف صف بالخطأ.
