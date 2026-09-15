import {
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { auth } from "../firebase/auth.js";
import { db } from "../firebase/firestore.js";
import { makeBillingCycleId } from "../domain/attendance.js";
import {
  BILLING_CYCLE_STATUSES,
  PAYMENT_REMINDER_LESSON,
} from "../domain/payments.js";
import { COLLECTIONS, workspaceDocumentRef } from "./firestore-paths.js";

// Legacy paid cycles stay closed. New cycles move from notice pending, to payment
// pending, then create an immutable payment document when payment is confirmed.

export async function ensurePaymentReminders(students = [], billingCycles = []) {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error("登入狀態已失效，請重新登入。");
  const existingCycleIds = new Set(billingCycles.map((cycle) => cycle.id));
  const candidates = students
    .filter((student) => Number(student.currentLessonCount) >= PAYMENT_REMINDER_LESSON)
    .map((student) => ({
      studentId: student.id,
      term: Number(student.currentTerm),
      cycleId: makeBillingCycleId(student.id, student.currentTerm),
    }))
    .filter((candidate) => !existingCycleIds.has(candidate.cycleId));
  if (!candidates.length) return 0;
  if (candidates.length > 200) throw new Error("待補建的收費單提醒過多，請分批處理。");

  return runTransaction(db, async (transaction) => {
    const references = candidates.flatMap((candidate) => [
      workspaceDocumentRef(COLLECTIONS.students, candidate.studentId),
      workspaceDocumentRef(COLLECTIONS.billingCycles, candidate.cycleId),
    ]);
    const snapshots = await Promise.all(references.map((reference) => transaction.get(reference)));
    let createdCount = 0;
    candidates.forEach((candidate, index) => {
      const studentSnapshot = snapshots[index * 2];
      const cycleSnapshot = snapshots[index * 2 + 1];
      if (!studentSnapshot.exists() || cycleSnapshot.exists()) return;
      const student = studentSnapshot.data();
      if (Number(student.currentTerm) !== candidate.term
        || Number(student.currentLessonCount) < PAYMENT_REMINDER_LESSON) return;
      const pendingPaymentCount = Number(student.pendingPaymentCount || 0) + 1;
      transaction.set(cycleSnapshot.ref, {
        studentId: candidate.studentId,
        term: candidate.term,
        status: "pending",
        paymentId: "",
        reminderAt: serverTimestamp(),
        noticeSentAt: null,
        paidAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      transaction.update(studentSnapshot.ref, {
        pendingPaymentCount,
        paymentPending: true,
        updatedAt: serverTimestamp(),
      });
      createdCount += 1;
    });
    return createdCount;
  });
}

function validateCycleIdentity(billingCycleId, { studentId, term }) {
  const expectedCycleId = makeBillingCycleId(studentId, term);
  if (billingCycleId !== expectedCycleId) throw new Error("收費單提醒資料不正確。");
}

export async function markBillingNoticeSent(billingCycleId, { studentId, term }) {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error("登入狀態已失效，請重新登入。");
  validateCycleIdentity(billingCycleId, { studentId, term });
  const cycleRef = workspaceDocumentRef(COLLECTIONS.billingCycles, billingCycleId);
  const studentRef = workspaceDocumentRef(COLLECTIONS.students, studentId);

  await runTransaction(db, async (transaction) => {
    const [cycleSnapshot, studentSnapshot] = await Promise.all([
      transaction.get(cycleRef),
      transaction.get(studentRef),
    ]);
    if (!studentSnapshot.exists()) throw new Error("找不到收費單對應的學生。");
    const student = studentSnapshot.data();
    if (!cycleSnapshot.exists()) {
      if (Number(student.currentTerm) !== Number(term)
        || Number(student.currentLessonCount) < PAYMENT_REMINDER_LESSON) {
        throw new Error("找不到待寄送的收費單提醒。");
      }
      transaction.set(cycleRef, {
        studentId,
        term: Number(term),
        status: BILLING_CYCLE_STATUSES.paymentPending,
        paymentId: "",
        reminderAt: serverTimestamp(),
        noticeSentAt: serverTimestamp(),
        paidAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const pendingPaymentCount = Number(student.pendingPaymentCount || 0) + 1;
      transaction.update(studentRef, {
        pendingPaymentCount,
        paymentPending: true,
        updatedAt: serverTimestamp(),
      });
      return;
    }
    const cycle = cycleSnapshot.data();
    if (cycle.studentId !== studentId || Number(cycle.term) !== Number(term)) {
      throw new Error("收費單提醒與學生資料不一致。");
    }
    if (cycle.status !== BILLING_CYCLE_STATUSES.noticePending) {
      throw new Error("這一期的收費單已開立或已繳費。");
    }

    transaction.update(cycleRef, {
      status: BILLING_CYCLE_STATUSES.paymentPending,
      noticeSentAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function markBillingCyclePaid(billingCycleId, { studentId, term }) {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error("登入狀態已失效，請重新登入。");
  validateCycleIdentity(billingCycleId, { studentId, term });
  const cycleRef = workspaceDocumentRef(COLLECTIONS.billingCycles, billingCycleId);
  const studentRef = workspaceDocumentRef(COLLECTIONS.students, studentId);
  const paymentRef = workspaceDocumentRef(COLLECTIONS.payments, billingCycleId);

  await runTransaction(db, async (transaction) => {
    const [cycleSnapshot, studentSnapshot, paymentSnapshot] = await Promise.all([
      transaction.get(cycleRef),
      transaction.get(studentRef),
      transaction.get(paymentRef),
    ]);
    if (!cycleSnapshot.exists()) throw new Error("找不到待繳費資料。");
    if (!studentSnapshot.exists()) throw new Error("找不到收費單對應的學生。");
    if (paymentSnapshot.exists()) throw new Error("這一期已有繳費紀錄。");
    const cycle = cycleSnapshot.data();
    if (cycle.studentId !== studentId || Number(cycle.term) !== Number(term)) {
      throw new Error("收費單提醒與學生資料不一致。");
    }
    if (cycle.status !== BILLING_CYCLE_STATUSES.paymentPending) {
      throw new Error("這一期目前不是待繳費狀態。");
    }
    const student = studentSnapshot.data();
    const pendingPaymentCount = Math.max(0, Number(student.pendingPaymentCount || 0) - 1);

    transaction.set(paymentRef, {
      billingCycleId,
      studentId,
      studentName: String(student.name || ""),
      term: Number(term),
      paidAt: serverTimestamp(),
      confirmedBy: user.uid,
      createdAt: serverTimestamp(),
    });
    transaction.update(cycleRef, {
      status: BILLING_CYCLE_STATUSES.paid,
      paymentId: billingCycleId,
      paidAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    transaction.update(studentRef, {
      pendingPaymentCount,
      paymentPending: pendingPaymentCount > 0,
      updatedAt: serverTimestamp(),
    });
  });
}
