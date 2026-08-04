import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteDoc: vi.fn(() => Promise.resolve()),
  documents: new Map(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => "server-timestamp"),
  transaction: {
    delete: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("firebase/firestore", () => ({
  deleteDoc: mocks.deleteDoc,
  getDoc: mocks.getDoc,
  getDocs: mocks.getDocs,
  limit: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  runTransaction: mocks.runTransaction,
  serverTimestamp: mocks.serverTimestamp,
  where: vi.fn(),
}));

vi.mock("../js/firebase/auth.js", () => ({
  auth: { currentUser: { uid: "teacher-uid" } },
}));

vi.mock("../js/firebase/firestore.js", () => ({ db: { id: "database" } }));

vi.mock("../js/repositories/firestore-paths.js", () => ({
  COLLECTIONS: {
    attendance: "attendance",
    billingCycles: "billingCycles",
    leaveRecords: "leaveRecords",
    students: "students",
  },
  workspaceCollectionRef: (collection) => collection,
  workspaceDocumentRef: (collection, id) => `${collection}/${id}`,
}));

const { markAttendance, removeLatestAttendance } = await import(
  "../js/repositories/attendance-repository.js"
);
const { cancelStudentLeave, markStudentLeave } = await import(
  "../js/repositories/leave-repository.js"
);

function snapshot(exists, data = {}) {
  return {
    data: () => data,
    exists: () => exists,
  };
}

const target = {
  studentId: "student-1",
  dateKey: "2026-07-27",
  slot: "15:00",
};
const recordId = "2026-07-27__15%3A00__student-1";

beforeEach(() => {
  mocks.deleteDoc.mockClear();
  mocks.getDoc.mockReset();
  mocks.getDocs.mockReset();
  mocks.documents.clear();
  Object.values(mocks.transaction).forEach((mock) => mock.mockClear());
  mocks.documents.set("students/student-1", snapshot(true, {
    currentLessonCount: 12,
    currentTerm: 1,
  }));
  mocks.documents.set(`attendance/${recordId}`, snapshot(false));
  mocks.documents.set(`leaveRecords/${recordId}`, snapshot(false));
  mocks.transaction.get.mockImplementation((reference) => Promise.resolve(
    mocks.documents.get(reference) || snapshot(false),
  ));
  mocks.runTransaction.mockImplementation((_database, callback) => callback(mocks.transaction));
});

describe("請假 repository", () => {
  test("登記請假只建立請假文件，不更新學生堂數", async () => {
    await expect(markStudentLeave(target)).resolves.toBe(true);

    expect(mocks.transaction.set).toHaveBeenCalledWith(`leaveRecords/${recordId}`, {
      ...target,
      recordedBy: "teacher-uid",
      createdAt: "server-timestamp",
      updatedAt: "server-timestamp",
    });
    expect(mocks.transaction.update).not.toHaveBeenCalled();
  });

  test("已有到班紀錄時不能登記請假", async () => {
    mocks.documents.set(`attendance/${recordId}`, snapshot(true));

    await expect(markStudentLeave(target)).rejects.toThrow("已完成到班");
    expect(mocks.transaction.set).not.toHaveBeenCalled();
  });

  test("尚未取消請假時不能完成到班", async () => {
    mocks.documents.set(`leaveRecords/${recordId}`, snapshot(true));

    await expect(markAttendance({
      ...target,
      arrivalTime: "14:58",
    })).rejects.toThrow("請先取消請假");
    expect(mocks.transaction.set).not.toHaveBeenCalled();
    expect(mocks.transaction.update).not.toHaveBeenCalled();
  });

  test("取消請假會刪除固定 ID 的請假文件", async () => {
    await cancelStudentLeave(target);

    expect(mocks.deleteDoc).toHaveBeenCalledWith(`leaveRecords/${recordId}`);
  });

  test("最新第 24 堂可跨期撤銷並恢復原期別第 23 堂", async () => {
    const attendanceData = {
      studentId: "student-1",
      dateKey: "2026-07-27",
      slot: "15:00",
      lessonNumber: 24,
      term: 1,
    };
    mocks.getDoc.mockResolvedValue(snapshot(true, attendanceData));
    mocks.getDocs.mockResolvedValue({
      docs: [{ id: recordId }],
      empty: false,
    });
    mocks.documents.set(`attendance/${recordId}`, snapshot(true, attendanceData));
    mocks.documents.set("students/student-1", snapshot(true, {
      currentLessonCount: 0,
      currentTerm: 2,
      pendingPaymentCount: 1,
    }));

    await removeLatestAttendance(recordId);

    expect(mocks.transaction.delete).toHaveBeenCalledWith(`attendance/${recordId}`);
    expect(mocks.transaction.update).toHaveBeenCalledWith("students/student-1", {
      currentLessonCount: 23,
      currentTerm: 1,
      updatedAt: "server-timestamp",
    });
  });

  test("第 24 堂之後已有新一期點名時仍禁止跨期撤銷", async () => {
    const attendanceData = {
      studentId: "student-1",
      dateKey: "2026-07-27",
      slot: "15:00",
      lessonNumber: 24,
      term: 1,
    };
    mocks.getDoc.mockResolvedValue(snapshot(true, attendanceData));
    mocks.getDocs.mockResolvedValue({
      docs: [{ id: "newer-attendance" }],
      empty: false,
    });

    await expect(removeLatestAttendance(recordId)).rejects.toThrow("只能刪除這位學生最新的一筆點名");
    expect(mocks.transaction.delete).not.toHaveBeenCalled();
  });

  test("學生進度已進入新一期時不會誤將第 24 堂回復", async () => {
    const attendanceData = {
      studentId: "student-1",
      dateKey: "2026-07-27",
      slot: "15:00",
      lessonNumber: 24,
      term: 1,
    };
    mocks.getDoc.mockResolvedValue(snapshot(true, attendanceData));
    mocks.getDocs.mockResolvedValue({ docs: [{ id: recordId }], empty: false });
    mocks.documents.set(`attendance/${recordId}`, snapshot(true, attendanceData));
    mocks.documents.set("students/student-1", snapshot(true, {
      currentLessonCount: 1,
      currentTerm: 2,
    }));

    await expect(removeLatestAttendance(recordId)).rejects.toThrow("請依時間倒序撤銷");
    expect(mocks.transaction.delete).not.toHaveBeenCalled();
  });
});
