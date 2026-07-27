import { isDateKey, isTimeValue } from "./models.js";

function encodeIdPart(value) {
  return encodeURIComponent(String(value));
}

export function makeAttendanceId({ dateKey, slot, studentId }) {
  if (!isDateKey(dateKey)) throw new Error("點名日期格式不正確。");
  if (!isTimeValue(slot)) throw new Error("點名時段格式不正確。");
  if (!studentId) throw new Error("點名學生不可為空白。");
  return [dateKey, slot, studentId].map(encodeIdPart).join("__");
}

export function makeBillingCycleId(studentId, term) {
  if (!studentId || !Number.isInteger(Number(term)) || Number(term) < 1) {
    throw new Error("付款期別資料不正確。");
  }
  return [studentId, Number(term)].map(encodeIdPart).join("__");
}
