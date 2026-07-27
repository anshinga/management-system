import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, test } from "vitest";

const PROJECT_ID = "demo-mpm-management";
const WORKSPACE_ID = "mpm-main";
const OWNER_EMAIL = "anshinga79@gmail.com";
let testEnvironment;

function workspaceDocument(database, ...segments) {
  return doc(database, "workspaces", WORKSPACE_ID, ...segments);
}

function timestampFields() {
  const timestamp = Timestamp.fromMillis(1_700_000_000_000);
  return { createdAt: timestamp, updatedAt: timestamp };
}

async function seedWorkspace() {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    const timestamps = timestampFields();
    await setDoc(doc(database, "workspaces", WORKSPACE_ID), {
      name: "MPM 課程管理",
      timezone: "Asia/Taipei",
      schemaVersion: 1,
      lastGradePromotionYear: 2026,
      ...timestamps,
    });
    await setDoc(workspaceDocument(database, "members", "teacher-uid"), {
      email: "teacher@example.com",
      name: "測試老師",
      role: "teacher",
      active: true,
      ...timestamps,
    });
    await setDoc(workspaceDocument(database, "members", "viewer-uid"), {
      email: "viewer@example.com",
      name: "唯讀成員",
      role: "viewer",
      active: true,
      ...timestamps,
    });
    await setDoc(workspaceDocument(database, "students", "student-1"), {
      name: "測試學生",
      grade: 5,
      currentLessonCount: 3,
      currentTerm: 1,
      status: "active",
      pendingPaymentCount: 0,
      paymentPending: false,
      ...timestamps,
    });
  });
}

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
});

beforeEach(async () => {
  await testEnvironment.clearFirestore();
  await seedWorkspace();
});

afterAll(async () => {
  await testEnvironment?.cleanup();
});

describe("Firestore Security Rules", () => {
  test("未登入使用者無法讀取工作區", async () => {
    const database = testEnvironment.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(database, "workspaces", WORKSPACE_ID)));
  });

  test("設定的 owner 帳號可以建立初始工作區", async () => {
    await testEnvironment.clearFirestore();
    const database = testEnvironment.authenticatedContext("owner-uid", {
      email: OWNER_EMAIL,
      email_verified: true,
    }).firestore();
    await assertSucceeds(setDoc(doc(database, "workspaces", WORKSPACE_ID), {
      name: "MPM 課程管理",
      timezone: "Asia/Taipei",
      schemaVersion: 1,
      lastGradePromotionYear: 2026,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
  });

  test("未授權帳號不能讀取工作區", async () => {
    const database = testEnvironment.authenticatedContext("stranger-uid", {
      email: "stranger@example.com",
      email_verified: true,
    }).firestore();
    await assertFails(getDoc(doc(database, "workspaces", WORKSPACE_ID)));
  });

  test("viewer 可以讀取學生但不能修改", async () => {
    const database = testEnvironment.authenticatedContext("viewer-uid", {
      email: "viewer@example.com",
      email_verified: true,
    }).firestore();
    const student = workspaceDocument(database, "students", "student-1");
    await assertSucceeds(getDoc(student));
    await assertFails(updateDoc(student, {
      name: "不應成功",
      updatedAt: serverTimestamp(),
    }));
  });

  test("owner 可以保存合法的舊資料快照，且不能保存不完整快照", async () => {
    const database = testEnvironment.authenticatedContext("owner-uid", {
      email: OWNER_EMAIL,
      email_verified: true,
    }).firestore();
    const student = workspaceDocument(database, "students", "student-1");
    await assertSucceeds(updateDoc(student, {
      previousLessonDate: "2026-07-20",
      previousLessonTerm: 1,
      previousLessonNumber: 3,
      updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(student, {
      previousLessonDate: "2026-07-20",
      previousLessonTerm: 1,
      previousLessonNumber: 25,
      updatedAt: serverTimestamp(),
    }));
  });

  test("teacher 不能透過學生歷史起點修改正式資料欄位", async () => {
    const database = testEnvironment.authenticatedContext("teacher-uid", {
      email: "teacher@example.com",
      email_verified: true,
    }).firestore();
    await assertFails(updateDoc(workspaceDocument(database, "students", "student-1"), {
      previousLessonDate: "2026-07-20",
      previousLessonTerm: 1,
      previousLessonNumber: 3,
      updatedAt: serverTimestamp(),
    }));
  });

  test("teacher 可以排課但不能建立付款紀錄", async () => {
    const database = testEnvironment.authenticatedContext("teacher-uid", {
      email: "teacher@example.com",
      email_verified: true,
    }).firestore();
    await assertSucceeds(setDoc(workspaceDocument(database, "scheduleEntries", "2026-07-27__16%3A30__student-1"), {
      studentId: "student-1",
      seasonId: "summer-2026",
      dateKey: "2026-07-27",
      slot: "16:30",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(setDoc(workspaceDocument(database, "scheduleOverrides", "2026-07-27__summer-2026__student-1__1__16%3A30"), {
      studentId: "student-1",
      seasonId: "summer-2026",
      weekStart: "2026-07-27",
      sourceWeekday: 1,
      sourceSlot: "16:30",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
    await assertFails(setDoc(workspaceDocument(database, "payments", "payment-1"), {
      studentId: "student-1",
      term: 1,
      amount: 2000,
      method: "transfer",
      paidDate: "2026-07-27",
      note: "",
      confirmedBy: "teacher-uid",
      createdAt: serverTimestamp(),
    }));
  });

  test("teacher 新增點名時必須在同一交易更新學生堂數", async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await updateDoc(workspaceDocument(context.firestore(), "students", "student-1"), {
        previousLessonDate: "2026-07-20",
      });
    });
    const database = testEnvironment.authenticatedContext("teacher-uid", {
      email: "teacher@example.com",
      email_verified: true,
    }).firestore();
    const student = workspaceDocument(database, "students", "student-1");
    const attendance = workspaceDocument(database, "attendance", "2026-07-27__16%3A30__student-1");
    const attendanceData = {
      studentId: "student-1",
      dateKey: "2026-07-27",
      slot: "16:30",
      arrivalTime: "16:28",
      lessonNumber: 4,
      term: 1,
      recordedBy: "teacher-uid",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await assertFails(setDoc(attendance, attendanceData));
    await assertSucceeds(runTransaction(database, async (transaction) => {
      const studentSnapshot = await transaction.get(student);
      transaction.set(attendance, attendanceData);
      transaction.update(student, {
        currentLessonCount: studentSnapshot.data().currentLessonCount + 1,
        updatedAt: serverTimestamp(),
      });
    }));
  });

  test("teacher 不能直接竄改待付款期數", async () => {
    const database = testEnvironment.authenticatedContext("teacher-uid", {
      email: "teacher@example.com",
      email_verified: true,
    }).firestore();
    await assertFails(updateDoc(workspaceDocument(database, "students", "student-1"), {
      pendingPaymentCount: 1,
      paymentPending: true,
      updatedAt: serverTimestamp(),
    }));
  });

  test("點名文件必須使用可防止重複的固定 ID", async () => {
    const database = testEnvironment.authenticatedContext("teacher-uid", {
      email: "teacher@example.com",
      email_verified: true,
    }).firestore();
    const student = workspaceDocument(database, "students", "student-1");
    const attendance = workspaceDocument(database, "attendance", "arbitrary-id");
    await assertFails(runTransaction(database, async (transaction) => {
      const studentSnapshot = await transaction.get(student);
      transaction.set(attendance, {
        studentId: "student-1",
        dateKey: "2026-07-27",
        slot: "16:30",
        arrivalTime: "16:28",
        lessonNumber: 4,
        term: 1,
        recordedBy: "teacher-uid",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      transaction.update(student, {
        currentLessonCount: studentSnapshot.data().currentLessonCount + 1,
        updatedAt: serverTimestamp(),
      });
    }));
  });

  test("第 24 堂必須同時開啟下一期並建立待付款期別", async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await updateDoc(workspaceDocument(context.firestore(), "students", "student-1"), {
        currentLessonCount: 23,
      });
    });
    const database = testEnvironment.authenticatedContext("teacher-uid", {
      email: "teacher@example.com",
      email_verified: true,
    }).firestore();
    const student = workspaceDocument(database, "students", "student-1");
    const attendance = workspaceDocument(database, "attendance", "2026-07-27__16%3A30__student-1");
    const cycle = workspaceDocument(database, "billingCycles", "student-1__1");
    await assertSucceeds(runTransaction(database, async (transaction) => {
      const studentSnapshot = await transaction.get(student);
      transaction.set(attendance, {
        studentId: "student-1",
        dateKey: "2026-07-27",
        slot: "16:30",
        arrivalTime: "16:28",
        lessonNumber: 24,
        term: 1,
        recordedBy: "teacher-uid",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      transaction.update(student, {
        currentLessonCount: 0,
        currentTerm: studentSnapshot.data().currentTerm + 1,
        pendingPaymentCount: studentSnapshot.data().pendingPaymentCount + 1,
        paymentPending: true,
        updatedAt: serverTimestamp(),
      });
      transaction.set(cycle, {
        studentId: "student-1",
        term: 1,
        status: "pending",
        paymentId: "",
        completedAt: serverTimestamp(),
        paidAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }));
  });

  test("第 24 堂缺少待付款期別時整筆交易失敗", async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await updateDoc(workspaceDocument(context.firestore(), "students", "student-1"), {
        currentLessonCount: 23,
      });
    });
    const database = testEnvironment.authenticatedContext("teacher-uid", {
      email: "teacher@example.com",
      email_verified: true,
    }).firestore();
    const student = workspaceDocument(database, "students", "student-1");
    const attendance = workspaceDocument(database, "attendance", "2026-07-27__16%3A30__student-1");
    await assertFails(runTransaction(database, async (transaction) => {
      const studentSnapshot = await transaction.get(student);
      transaction.set(attendance, {
        studentId: "student-1",
        dateKey: "2026-07-27",
        slot: "16:30",
        arrivalTime: "16:28",
        lessonNumber: 24,
        term: 1,
        recordedBy: "teacher-uid",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      transaction.update(student, {
        currentLessonCount: 0,
        currentTerm: studentSnapshot.data().currentTerm + 1,
        pendingPaymentCount: studentSnapshot.data().pendingPaymentCount + 1,
        paymentPending: true,
        updatedAt: serverTimestamp(),
      });
    }));
  });

  test("owner 必須在同一交易中結清期別並建立不可變更的付款紀錄", async () => {
    const database = testEnvironment.authenticatedContext("owner-uid", {
      email: OWNER_EMAIL,
      email_verified: true,
    }).firestore();
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const adminDatabase = context.firestore();
      const timestamps = timestampFields();
      await setDoc(workspaceDocument(adminDatabase, "billingCycles", "student-1__1"), {
        studentId: "student-1",
        term: 1,
        status: "pending",
        paymentId: "",
        completedAt: timestamps.createdAt,
        paidAt: null,
        ...timestamps,
      });
      await updateDoc(workspaceDocument(adminDatabase, "students", "student-1"), {
        pendingPaymentCount: 1,
        paymentPending: true,
      });
    });
    const cycle = workspaceDocument(database, "billingCycles", "student-1__1");
    const student = workspaceDocument(database, "students", "student-1");
    const payment = workspaceDocument(database, "payments", "payment-1");
    await assertSucceeds(runTransaction(database, async (transaction) => {
      const [cycleSnapshot, studentSnapshot] = await Promise.all([
        transaction.get(cycle),
        transaction.get(student),
      ]);
      transaction.set(payment, {
        billingCycleId: cycleSnapshot.id,
        studentId: cycleSnapshot.data().studentId,
        term: cycleSnapshot.data().term,
        amount: 2000,
        method: "cash",
        paidDate: "2026-07-27",
        note: "第一期",
        confirmedBy: "owner-uid",
        createdAt: serverTimestamp(),
      });
      transaction.update(cycle, {
        status: "paid",
        paymentId: "payment-1",
        paidAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      transaction.update(student, {
        pendingPaymentCount: studentSnapshot.data().pendingPaymentCount - 1,
        paymentPending: false,
        updatedAt: serverTimestamp(),
      });
    }));
    await assertFails(updateDoc(payment, { note: "事後修改" }));
  });

  test("不合法的學生欄位會被拒絕", async () => {
    const database = testEnvironment.authenticatedContext("owner-uid", {
      email: OWNER_EMAIL,
      email_verified: true,
    }).firestore();
    await assertFails(setDoc(workspaceDocument(database, "students", "invalid-student"), {
      name: "",
      grade: 99,
      currentLessonCount: -1,
      currentTerm: 0,
      status: "unknown",
      pendingPaymentCount: 0,
      paymentPending: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
  });

  test("未知的頂層集合預設拒絕存取", async () => {
    const database = testEnvironment.authenticatedContext("owner-uid", {
      email: OWNER_EMAIL,
      email_verified: true,
    }).firestore();
    await assertFails(getDoc(doc(collection(database, "unknown"), "document")));
  });
});
