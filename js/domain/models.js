export const STUDENT_STATUSES = Object.freeze(["active", "paused"]);
export const MEMBER_ROLES = Object.freeze(["owner", "teacher", "viewer"]);
export const PAYMENT_METHODS = Object.freeze(["cash", "transfer", "card", "other"]);

export function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeStudentInput(input = {}) {
  return {
    name: normalizeText(input.name),
    grade: Number(input.grade),
    currentLessonCount: Number(input.currentLessonCount ?? input.lessonCount ?? 0),
    currentTerm: Number(input.currentTerm ?? input.term ?? 1),
    previousLessonDate: normalizeText(input.previousLessonDate),
    status: STUDENT_STATUSES.includes(input.status) ? input.status : "active",
    pendingPaymentCount: Number(input.pendingPaymentCount ?? 0),
    paymentPending: Boolean(input.paymentPending),
  };
}

export function normalizePaymentInput(input = {}) {
  return {
    amount: Number(input.amount),
    method: PAYMENT_METHODS.includes(input.method) ? input.method : "other",
    paidDate: normalizeText(input.paidDate),
    note: normalizeText(input.note),
  };
}

export function isDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day;
}

export function isTimeValue(value) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hours, minutes] = value.split(":").map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}
