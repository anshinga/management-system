import {
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { isDateKey, normalizeStudentInput, normalizeText } from "../domain/models.js";
import { COLLECTIONS, workspaceCollectionRef, workspaceDocumentRef } from "./firestore-paths.js";

function validateStudent(student) {
  if (!student.name) throw new Error("請輸入學生姓名。");
  if (student.note.length > 1000) throw new Error("學生備註不可超過 1000 字。");
  if (!Number.isInteger(student.grade) || student.grade < 1 || student.grade > 20) {
    throw new Error("年級必須是 1 到 20 的整數。");
  }
  if (!Number.isInteger(student.currentLessonCount) || student.currentLessonCount < 0 || student.currentLessonCount > 23) {
    throw new Error("目前堂數必須是 0 到 23 的整數。");
  }
  if (!Number.isInteger(student.currentTerm) || student.currentTerm < 1) {
    throw new Error("期數必須是大於 0 的整數。");
  }
  if (student.previousLessonDate && !isDateKey(student.previousLessonDate)) {
    throw new Error("上一次上課日期必須是有效日期。");
  }
  if (student.previousLessonDate) {
    if (!Number.isInteger(student.previousLessonTerm) || student.previousLessonTerm < 1) {
      throw new Error("上一次上課期數必須是大於 0 的整數。");
    }
    if (!Number.isInteger(student.previousLessonNumber) || student.previousLessonNumber < 1 || student.previousLessonNumber > 24) {
      throw new Error("上一次上課堂數必須是 1 到 24 的整數。");
    }
  } else if (student.previousLessonTerm !== 0 || student.previousLessonNumber !== 0) {
    throw new Error("沒有上一次上課日期時，不可保留歷史期數或堂數。");
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

export async function updateStudentNote(studentId, note) {
  const normalizedNote = normalizeText(note);
  if (normalizedNote.length > 1000) throw new Error("學生備註不可超過 1000 字。");
  await updateDoc(workspaceDocumentRef(COLLECTIONS.students, studentId), {
    note: normalizedNote,
    updatedAt: serverTimestamp(),
  });
}
