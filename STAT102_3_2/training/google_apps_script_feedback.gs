/**
 * Google Apps Script Web App for STAT102 feedback intake.
 *
 * Configure:
 * 1) Set your spreadsheet ID in SPREADSHEET_ID.
 * 2) Deploy as Web App (Execute as: Me, Who has access: Anyone).
 */

const SPREADSHEET_ID = "PUT_SPREADSHEET_ID_HERE";
const SHEET_NAME = "Feedback";
const EXPECTED_HEADERS = [
  "timestamp",
  "lesson_id",
  "question_id",
  "topic_id",
  "feedback_type",
  "feedback_text",
  "page_url",
  "attempts_count",
  "student_answer_snapshot",
  "user_agent",
  "session_id"
];

function doPost(e) {
  try {
    const payload = parseIncomingJson_(e);
    const normalized = normalizePayload_(payload);
    const sheet = getOrCreateSheet_();
    appendFeedbackRow_(sheet, normalized);
    return jsonResponse_({ success: true });
  } catch (err) {
    return jsonResponse_({
      success: false,
      error: String(err && err.message ? err.message : err)
    });
  }
}

function parseIncomingJson_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error("No POST body received.");
  }
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (_err) {
    throw new Error("Invalid JSON payload.");
  }
  if (!data || typeof data !== "object") {
    throw new Error("Payload must be a JSON object.");
  }
  return data;
}

function normalizePayload_(raw) {
  return {
    timestamp: safeString_(raw.timestamp) || new Date().toISOString(),
    lesson_id: safeString_(raw.lesson_id),
    question_id: safeString_(raw.question_id),
    topic_id: safeString_(raw.topic_id),
    feedback_type: safeString_(raw.feedback_type),
    feedback_text: safeString_(raw.feedback_text),
    page_url: safeString_(raw.page_url),
    attempts_count: safeNumber_(raw.attempts_count),
    student_answer_snapshot: safeString_(raw.student_answer_snapshot),
    user_agent: safeString_(raw.user_agent),
    session_id: safeString_(raw.session_id)
  };
}

function getOrCreateSheet_() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID === "PUT_SPREADSHEET_ID_HERE") {
    throw new Error("Set SPREADSHEET_ID first.");
  }
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  const headerRange = sheet.getRange(1, 1, 1, EXPECTED_HEADERS.length);
  const current = headerRange.getValues()[0];
  const hasHeader = current.some(Boolean);
  if (!hasHeader) {
    headerRange.setValues([EXPECTED_HEADERS]);
    sheet.setFrozenRows(1);
  } else if (!headersMatch_(current, EXPECTED_HEADERS)) {
    sheet.insertRows(1, 1);
    sheet.getRange(1, 1, 1, EXPECTED_HEADERS.length).setValues([EXPECTED_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function appendFeedbackRow_(sheet, payload) {
  const row = [
    payload.timestamp,
    payload.lesson_id,
    payload.question_id,
    payload.topic_id,
    payload.feedback_type,
    payload.feedback_text,
    payload.page_url,
    payload.attempts_count,
    payload.student_answer_snapshot,
    payload.user_agent,
    payload.session_id
  ];
  sheet.appendRow(row);
}

function headersMatch_(a, b) {
  if (!a || !b || a.length < b.length) return false;
  for (let i = 0; i < b.length; i++) {
    if (String(a[i]).trim() !== String(b[i]).trim()) return false;
  }
  return true;
}

function safeString_(value) {
  return value == null ? "" : String(value).trim();
}

function safeNumber_(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
