import {
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { auth } from "../firebase/auth.js";
import { db } from "../firebase/firestore.js";
import { isDateKey, normalizePaymentInput } from "../domain/models.js";
import { COLLECTIONS, workspaceCollectionRef, workspaceDocumentRef } from "./firestore-paths.js";

export async function confirmBillingCyclePayment(billingCycleId, input) {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error("登入狀態已失效，請重新登入。");
  const payment = normalizePaymentInput(input);
  if (!Number.isFinite(payment.amount) || payment.amount < 0) throw new Error("請輸入有效的付款金額。");
  if (!isDateKey(payment.paidDate)) throw new Error("付款日期格式不正確。");

  const cycleRef = workspaceDocumentRef(COLLECTIONS.billingCycles, billingCycleId);
  const paymentRef = doc(workspaceCollectionRef(COLLECTIONS.payments));

  await runTransaction(db, async (transaction) => {
    const cycleSnapshot = await transaction.get(cycleRef);
    if (!cycleSnapshot.exists()) throw new Error("找不到待付款期別。");
    const cycle = cycleSnapshot.data();
    if (cycle.status !== "pending") throw new Error("這一期已經完成付款。");
    const studentRef = workspaceDocumentRef(COLLECTIONS.students, cycle.studentId);
    const studentSnapshot = await transaction.get(studentRef);
    if (!studentSnapshot.exists()) throw new Error("找不到付款學生。");
    const student = studentSnapshot.data();
    const pendingPaymentCount = Math.max(0, Number(student.pendingPaymentCount || 0) - 1);

    transaction.set(paymentRef, {
      billingCycleId,
      studentId: cycle.studentId,
      term: cycle.term,
      amount: payment.amount,
      method: payment.method,
      paidDate: payment.paidDate,
      note: payment.note,
      confirmedBy: user.uid,
      createdAt: serverTimestamp(),
    });
    transaction.update(cycleRef, {
      status: "paid",
      paymentId: paymentRef.id,
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
