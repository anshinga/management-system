import { makeBillingCycleId } from "./attendance.js";

export const PAYMENT_REMINDER_LESSON = 20;
export const BILLING_CYCLE_STATUSES = Object.freeze({
  noticePending: "pending",
  paymentPending: "awaiting_payment",
  paid: "paid",
});

function studentCycles(student, billingCycles = []) {
  return billingCycles.filter((cycle) => cycle.studentId === student.id);
}

export function needsPaymentReminder(student, billingCycles = []) {
  const cycles = studentCycles(student, billingCycles);
  if (student.paymentPending === true) return true;
  if (cycles.some((cycle) => [
    BILLING_CYCLE_STATUSES.noticePending,
    BILLING_CYCLE_STATUSES.paymentPending,
  ].includes(cycle.status))) return true;
  const currentTerm = Number(student.currentTerm);
  const currentCycle = cycles.find((cycle) => Number(cycle.term) === currentTerm);
  return Number(student.currentLessonCount) >= PAYMENT_REMINDER_LESSON
    && !currentCycle;
}

export function getPaymentReminderItems(students = [], billingCycles = []) {
  const items = billingCycles
    .filter((cycle) => [
      BILLING_CYCLE_STATUSES.noticePending,
      BILLING_CYCLE_STATUSES.paymentPending,
    ].includes(cycle.status))
    .map((cycle) => ({
      id: cycle.id,
      studentId: cycle.studentId,
      term: Number(cycle.term),
      status: cycle.status,
      reminderAt: cycle.reminderAt || cycle.completedAt || null,
      noticeSentAt: cycle.noticeSentAt || null,
      isDerived: false,
    }));
  const existingCycleKeys = new Set(billingCycles.map((cycle) => (
    `${cycle.studentId}\u0000${Number(cycle.term)}`
  )));

  students.forEach((student) => {
    const term = Number(student.currentTerm);
    const key = `${student.id}\u0000${term}`;
    if (Number(student.currentLessonCount) < PAYMENT_REMINDER_LESSON
      || !student.id
      || !Number.isInteger(term)
      || term < 1
      || existingCycleKeys.has(key)) return;
    items.push({
      id: makeBillingCycleId(student.id, term),
      studentId: student.id,
      term,
      status: BILLING_CYCLE_STATUSES.noticePending,
      reminderAt: null,
      noticeSentAt: null,
      isDerived: true,
    });
  });

  return items;
}

export function getBillingNoticeItems(students = [], billingCycles = []) {
  return getPaymentReminderItems(students, billingCycles)
    .filter((item) => item.status === BILLING_CYCLE_STATUSES.noticePending);
}

export function getAwaitingPaymentItems(students = [], billingCycles = []) {
  return getPaymentReminderItems(students, billingCycles)
    .filter((item) => item.status === BILLING_CYCLE_STATUSES.paymentPending);
}
