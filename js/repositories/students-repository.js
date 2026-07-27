import {
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { normalizeStudentInput } from "../domain/models.js";
import { COLLECTIONS, workspaceCollectionRef, workspaceDocumentRef } from "./firestore-paths.js";

function validateStudent(student) {
  if (!student.name) throw new Error("請輸入學生姓名。");
  if (!Number.isInteger(student.grade) || student.grade < 1 || student.grade > 20) {
    throw new Error("年級必須是 1 到 20 的整數。");
  }
  if (!Number.isInteger(student.currentLessonCount) || student.currentLessonCount < 0 || student.currentLessonCount > 23) {
    throw new Error("目前堂數必須是 0 到 23 的整數。");
  }
  if (!Number.isInteger(student.currentTerm) || student.currentTerm < 1) {
    throw new Error("期數必須是大於 0 的整數。");
  }
  if (!Number.isInteger(student.pendingPaymentCount) || student.pendingPaymentCount < 0) {
    throw new Error("待付款期數不可小於 0。");
  }
  if (student.paymentPending !== (student.pendingPaymentCount > 0)) {
    throw new Error("待付款狀態與待付款期數不一致。");
  }
}

export async function createStudent(input) {
  const student = normalizeStudentInput(input);
  validateStudent(student);
  const reference = doc(workspaceCollectionRef(COLLECTIONS.students));
  await setDoc(reference, {
    ...student,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return reference.id;
}

export async function updateStudent(studentId, input) {
  const student = normalizeStudentInput(input);
  validateStudent(student);
  await updateDoc(workspaceDocumentRef(COLLECTIONS.students, studentId), {
    ...student,
    updatedAt: serverTimestamp(),
  });
}
