import { makeBillingCycleId } from "./attendance.js";

export const PAYMENT_REMINDER_LESSON = 20;

function studentCycles(student, billingCycles = []) {
  return billingCycles.filter((cycle) => cycle.studentId === student.id);
}

export function needsPaymentReminder(student, billingCycles = []) {
  const cycles = studentCycles(student, billingCycles);
  if (student.paymentPending === true) return true;
  if (cycles.some((cycle) => cycle.status === "pending")) return true;
  const currentTerm = Number(student.currentTerm);
  const currentCycle = cycles.find((cycle) => Number(cycle.term) === currentTerm);
  return Number(student.currentLessonCount) >= PAYMENT_REMINDER_LESSON
    && !currentCycle;
}

export function getPaymentReminderItems(students = [], billingCycles = []) {
  const items = billingCycles
    .filter((cycle) => cycle.status === "pending")
    .map((cycle) => ({
      id: cycle.id,
      studentId: cycle.studentId,
      term: Number(cycle.term),
      reminderAt: cycle.reminderAt || cycle.completedAt || null,
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
      reminderAt: null,
      isDerived: true,
    });
  });

  return items;
}
