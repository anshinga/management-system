import {
  deleteDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { auth } from "../firebase/auth.js";
import { db } from "../firebase/firestore.js";
import { makeAttendanceId } from "../domain/attendance.js";
import { isDateKey, isTimeValue } from "../domain/models.js";
import { COLLECTIONS, workspaceDocumentRef } from "./firestore-paths.js";

function requireCurrentUser() {
  if (!auth.currentUser?.uid) throw new Error("登入狀態已失效，請重新登入。");
  return auth.currentUser;
}

function validateLeaveTarget({ studentId, dateKey, slot }) {
  if (!studentId || !isDateKey(dateKey) || !isTimeValue(slot)) {
    throw new Error("請假學生、日期或時段格式不正確。");
  }
}

function recordReference(collection, value) {
  return workspaceDocumentRef(collection, makeAttendanceId(value));
}

export async function markStudentLeave({ studentId, dateKey, slot }) {
  const user = requireCurrentUser();
  const target = { studentId, dateKey, slot };
  validateLeaveTarget(target);
  const studentRef = workspaceDocumentRef(COLLECTIONS.students, studentId);
  const attendanceRef = recordReference(COLLECTIONS.attendance, target);
  const leaveRef = recordReference(COLLECTIONS.leaveRecords, target);

  return runTransaction(db, async (transaction) => {
    const [studentSnapshot, attendanceSnapshot, leaveSnapshot] = await Promise.all([
      transaction.get(studentRef),
      transaction.get(attendanceRef),
      transaction.get(leaveRef),
    ]);
    if (!studentSnapshot.exists()) throw new Error("找不到這位學生。");
    if (attendanceSnapshot.exists()) throw new Error("這位學生已完成到班，不能改為請假。");
    if (leaveSnapshot.exists()) return false;

    transaction.set(leaveRef, {
      studentId,
      dateKey,
      slot,
      recordedBy: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return true;
  });
}

export async function cancelStudentLeave({ studentId, dateKey, slot }) {
  requireCurrentUser();
  const target = { studentId, dateKey, slot };
  validateLeaveTarget(target);
  await deleteDoc(recordReference(COLLECTIONS.leaveRecords, target));
}
