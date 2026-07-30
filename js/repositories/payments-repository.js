import {
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { auth } from "../firebase/auth.js";
import { db } from "../firebase/firestore.js";
import { makeBillingCycleId } from "../domain/attendance.js";
import { PAYMENT_REMINDER_LESSON } from "../domain/payments.js";
import { COLLECTIONS, workspaceDocumentRef } from "./firestore-paths.js";

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
  if (candidates.length > 200) throw new Error("待補建的繳費提醒過多，請分批處理。");

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

export async function markBillingCyclePaid(billingCycleId, { studentId, term }) {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error("登入狀態已失效，請重新登入。");
  const expectedCycleId = makeBillingCycleId(studentId, term);
  if (billingCycleId !== expectedCycleId) throw new Error("繳費提醒資料不正確。");
  const cycleRef = workspaceDocumentRef(COLLECTIONS.billingCycles, billingCycleId);
  const studentRef = workspaceDocumentRef(COLLECTIONS.students, studentId);

  await runTransaction(db, async (transaction) => {
    const [cycleSnapshot, studentSnapshot] = await Promise.all([
      transaction.get(cycleRef),
      transaction.get(studentRef),
    ]);
    if (!studentSnapshot.exists()) throw new Error("找不到付款學生。");
    const student = studentSnapshot.data();
    if (!cycleSnapshot.exists()) {
      if (Number(student.currentTerm) !== Number(term)
        || Number(student.currentLessonCount) < PAYMENT_REMINDER_LESSON) {
        throw new Error("找不到待繳費提醒。");
      }
      transaction.set(cycleRef, {
        studentId,
        term: Number(term),
        status: "paid",
        paymentId: "",
        reminderAt: serverTimestamp(),
        paidAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return;
    }
    const cycle = cycleSnapshot.data();
    if (cycle.studentId !== studentId || Number(cycle.term) !== Number(term)) {
      throw new Error("繳費提醒與學生資料不一致。");
    }
    if (cycle.status !== "pending") throw new Error("這一期已經標記為已繳費。");
    const pendingPaymentCount = Math.max(0, Number(student.pendingPaymentCount || 0) - 1);

    transaction.update(cycleRef, {
      status: "paid",
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
