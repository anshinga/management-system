import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteDoc: vi.fn(() => Promise.resolve()),
  documents: new Map(),
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
  getDoc: vi.fn(),
  getDocs: vi.fn(),
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

const { markAttendance } = await import("../js/repositories/attendance-repository.js");
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
});
