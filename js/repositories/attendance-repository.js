import {
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  getDoc,
  getDocs,
} from "firebase/firestore";
import { auth } from "../firebase/auth.js";
import { db } from "../firebase/firestore.js";
import { makeAttendanceId, makeBillingCycleId } from "../domain/attendance.js";
import { isDateKey, isTimeValue } from "../domain/models.js";
import { COLLECTIONS, workspaceCollectionRef, workspaceDocumentRef } from "./firestore-paths.js";

function requireCurrentUser() {
  if (!auth.currentUser?.uid) throw new Error("登入狀態已失效，請重新登入。");
  return auth.currentUser;
}

function attendanceReference(value) {
  return workspaceDocumentRef(COLLECTIONS.attendance, makeAttendanceId(value));
}

function leaveRecordReference(value) {
  return workspaceDocumentRef(COLLECTIONS.leaveRecords, makeAttendanceId(value));
}

export async function markAttendance({ studentId, dateKey, slot, arrivalTime }) {
  const user = requireCurrentUser();
  if (!isDateKey(dateKey) || !isTimeValue(slot) || !isTimeValue(arrivalTime)) {
    throw new Error("點名日期或時間格式不正確。");
  }
  const studentRef = workspaceDocumentRef(COLLECTIONS.students, studentId);
  const recordRef = attendanceReference({ studentId, dateKey, slot });
  const leaveRef = leaveRecordReference({ studentId, dateKey, slot });

  await runTransaction(db, async (transaction) => {
    const [studentSnapshot, recordSnapshot, leaveSnapshot] = await Promise.all([
      transaction.get(studentRef),
      transaction.get(recordRef),
      transaction.get(leaveRef),
    ]);
    if (!studentSnapshot.exists()) throw new Error("找不到這位學生。");
    if (leaveSnapshot.exists()) throw new Error("這位學生已登記請假，請先取消請假。");
    if (recordSnapshot.exists()) {
      transaction.update(recordRef, {
        arrivalTime,
        updatedAt: serverTimestamp(),
      });
      return;
    }

    const student = studentSnapshot.data();
    const term = Number(student.currentTerm);
    const lessonNumber = Number(student.currentLessonCount) + 1;
    const createsPaymentReminder = lessonNumber === 20;
    const completesTerm = lessonNumber === 24;
    let cycleRef;
    let cycleSnapshot;

    if (createsPaymentReminder) {
      cycleRef = workspaceDocumentRef(COLLECTIONS.billingCycles, makeBillingCycleId(studentId, term));
      cycleSnapshot = await transaction.get(cycleRef);
    }

    transaction.set(recordRef, {
      studentId,
      dateKey,
      slot,
      arrivalTime,
      lessonNumber,
      term,
      recordedBy: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (createsPaymentReminder && !cycleSnapshot.exists()) {
      const pendingPaymentCount = Number(student.pendingPaymentCount || 0) + 1;
      transaction.update(studentRef, {
        currentLessonCount: lessonNumber,
        pendingPaymentCount,
        paymentPending: true,
        updatedAt: serverTimestamp(),
      });
      transaction.set(cycleRef, {
        studentId,
        term,
        status: "pending",
        paymentId: "",
        reminderAt: serverTimestamp(),
        paidAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return;
    }

    if (completesTerm) {
      transaction.update(studentRef, {
        currentLessonCount: 0,
        currentTerm: term + 1,
        updatedAt: serverTimestamp(),
      });
      return;
    }

    transaction.update(studentRef, {
      currentLessonCount: lessonNumber,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function updateAttendanceTime(attendanceId, arrivalTime) {
  requireCurrentUser();
  if (!isTimeValue(arrivalTime)) throw new Error("到班時間格式不正確。");
  const reference = workspaceDocumentRef(COLLECTIONS.attendance, attendanceId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new Error("找不到這筆點名紀錄。");
    transaction.update(reference, {
      arrivalTime,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function removeLatestAttendance(attendanceId) {
  requireCurrentUser();
  const recordRef = workspaceDocumentRef(COLLECTIONS.attendance, attendanceId);
  const recordSnapshot = await getDoc(recordRef);
  if (!recordSnapshot.exists()) throw new Error("找不到這筆點名紀錄。");
  const record = recordSnapshot.data();
  const latestSnapshot = await getDocs(query(
    workspaceCollectionRef(COLLECTIONS.attendance),
    where("studentId", "==", record.studentId),
    orderBy("createdAt", "desc"),
    limit(1),
  ));
  if (latestSnapshot.empty || latestSnapshot.docs[0].id !== attendanceId) {
    throw new Error("為維持堂數一致，只能刪除這位學生最新的一筆點名。");
  }

  const studentRef = workspaceDocumentRef(COLLECTIONS.students, record.studentId);
  const cycleRef = Number(record.lessonNumber) === 20
    ? workspaceDocumentRef(
      COLLECTIONS.billingCycles,
      makeBillingCycleId(record.studentId, record.term),
    )
    : null;
  await runTransaction(db, async (transaction) => {
    const [freshRecord, studentSnapshot, cycleSnapshot] = await Promise.all([
      transaction.get(recordRef),
      transaction.get(studentRef),
      cycleRef ? transaction.get(cycleRef) : Promise.resolve(null),
    ]);
    if (!freshRecord.exists() || !studentSnapshot.exists()) throw new Error("點名或學生資料已不存在。");
    const student = studentSnapshot.data();
    if (Number(freshRecord.data().term) !== Number(student.currentTerm)) {
      throw new Error("已結算期別的點名不可刪除；請保留紀錄並另行備註調整。");
    }
    transaction.delete(recordRef);
    const removesPendingReminder = cycleSnapshot?.exists()
      && cycleSnapshot.data().status === "pending";
    if (removesPendingReminder) transaction.delete(cycleRef);
    const pendingPaymentCount = removesPendingReminder
      ? Math.max(0, Number(student.pendingPaymentCount || 0) - 1)
      : Number(student.pendingPaymentCount || 0);
    transaction.update(studentRef, {
      currentLessonCount: Math.max(0, Number(student.currentLessonCount || 0) - 1),
      ...(removesPendingReminder ? {
        pendingPaymentCount,
        paymentPending: pendingPaymentCount > 0,
      } : {}),
      updatedAt: serverTimestamp(),
    });
  });
}
