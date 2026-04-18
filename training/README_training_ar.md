# دليل التدريب الداخلي (BKT + Logistic Regression)

هذا المجلد مخصص لتدريب النماذج محليًا بدون أي API خارجي.

## 1) جاهزية جمع بيانات 200 طالب

- عند فتح أي اختبار سيظهر إدخال الرقم الجامعي تلقائيًا (أول مرة فقط).
- كل حدث تفاعل سيتم ربطه بالحقل `student_id`.
- يمكنك تغيير الطالب يدويًا من Console:
  - `AdaptiveLearning.setStudentId("443211234")`

## 2) أين أضع بيانات التدريب؟

- ضع ملف السجل في المسار:
  - `training/data/student_training_log.json`
- صيغة كل سجل تشمل الحقول:
  - `student_id`
  - `question_id`
  - `skill_id` أو `topic_id`
  - `difficulty`
  - `is_correct`
  - `attempts_count`
  - `used_help`
  - `time_spent_sec`
  - `showed_solution`
  - `timestamp`

يمكنك التصدير عبر:
- كل البيانات (كل الطلاب): `exportTrainingData()`  
  (الاسم الافتراضي الآن: `training_batch_200.json`)
- طالب محدد: `AdaptiveLearning.exportStudentTrainingData("443211234")`

## 3) كيف أعيد التدريب؟

من مجلد الدرس `STAT102_3_2` شغّل:

```bash
python training/train_lr_bkt.py --input training/data/student_training_log.json
```

يمكن تخصيص مسار الإخراج:

```bash
python training/train_lr_bkt.py --input training/data/student_training_log.json --models-dir models
```

## 4) أين تُحفظ الأوزان؟

بعد التدريب يتم تحديث:
- `models/bkt_model.json`
- `models/lr_model.json`

الواجهة تقرأ هذه الملفات تلقائيًا عبر:
- `loadModelWeights(...)`

## 5) ملاحظات مهمة

- إذا كانت البيانات قليلة، النظام يستخدم طبقة بيانات صناعية مؤقتة داخل `adaptive_learning.js` فقط للتجربة الأولى.
- عند توفر بيانات حقيقية كافية، سيتم الاعتماد عليها تلقائيًا في التدريب.
- فصل التدريب عن الاستدلال (inference) محفوظ:
  - التدريب: `training/*`
  - الاستدلال داخل الواجهة: `assets/js/adaptive_learning.js`
