import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const documents = new Map();
  const transaction = {
    delete: vi.fn(),
    get: vi.fn(async (reference) => ({
      ref: reference,
      exists: () => documents.has(reference.path),
      data: () => documents.get(reference.path),
    })),
    set: vi.fn(),
    update: vi.fn(),
  };
  return { documents, transaction };
});

vi.mock("firebase/firestore", () => ({
  getDocs: vi.fn(),
  query: vi.fn(),
  runTransaction: vi.fn((database, callback) => callback(mocks.transaction)),
  serverTimestamp: vi.fn(() => "server-time"),
  where: vi.fn(),
}));

vi.mock("../js/firebase/firestore.js", () => ({ db: {} }));

vi.mock("../js/repositories/firestore-paths.js", () => ({
  COLLECTIONS: {
    attendance: "attendance",
    scheduleEntries: "scheduleEntries",
    scheduleOverrides: "scheduleOverrides",
  },
  workspaceCollectionRef: (name) => ({ name }),
  workspaceDocumentRef: (name, id) => ({
    id,
    path: `${name}/${id}`,
  }),
}));

const { moveScheduleEntryForDate } = await import(
  "../js/repositories/schedule-repository.js"
);

const source = {
  dateKey: "2026-07-27",
  slot: "15:00",
  seasonId: "summer-2026",
};
const target = {
  dateKey: "2026-07-27",
  slot: "16:30",
  seasonId: "summer-2026",
};
const sourcePath = "scheduleEntries/2026-07-27__15%3A00__student-1";
const targetPath = "scheduleEntries/2026-07-27__16%3A30__student-1";
const overridePath = "scheduleOverrides/2026-07-27__summer-2026__student-1__1__15%3A00";

beforeEach(() => {
  mocks.documents.clear();
  Object.values(mocks.transaction).forEach((method) => method.mockClear());
});

describe("single-day schedule move", () => {
  test("固定排課保留原文件，以覆寫隱藏並建立目標臨時排課", async () => {
    mocks.documents.set(sourcePath, { studentId: "student-1", ...source });

    await moveScheduleEntryForDate("student-1", source, target);

    expect(mocks.transaction.delete).not.toHaveBeenCalled();
    expect(mocks.transaction.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: targetPath }),
      expect.objectContaining({
        studentId: "student-1",
        ...target,
        temporary: true,
      }),
    );
    expect(mocks.transaction.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: overridePath }),
      expect.objectContaining({
        studentId: "student-1",
        seasonId: "summer-2026",
        weekStart: "2026-07-27",
        sourceWeekday: 1,
        sourceSlot: "15:00",
      }),
    );
  });

  test("臨時排課移動時刪除原臨時文件，不建立額外覆寫", async () => {
    mocks.documents.set(sourcePath, {
      studentId: "student-1",
      ...source,
      temporary: true,
    });

    await moveScheduleEntryForDate("student-1", { ...source, temporary: true }, target);

    expect(mocks.transaction.delete).toHaveBeenCalledWith(
      expect.objectContaining({ path: sourcePath }),
    );
    expect(mocks.transaction.set).toHaveBeenCalledTimes(1);
    expect(mocks.transaction.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: targetPath }),
      expect.objectContaining({ temporary: true }),
    );
  });

  test("臨時排課拖回被覆寫的固定時段時恢復原排課", async () => {
    mocks.documents.set(targetPath, {
      studentId: "student-1",
      ...target,
      temporary: true,
    });
    mocks.documents.set(sourcePath, {
      studentId: "student-1",
      ...source,
    });
    mocks.documents.set(overridePath, {
      studentId: "student-1",
      seasonId: "summer-2026",
      weekStart: "2026-07-27",
      sourceWeekday: 1,
      sourceSlot: "15:00",
    });

    await moveScheduleEntryForDate(
      "student-1",
      { ...target, temporary: true },
      source,
    );

    expect(mocks.transaction.delete).toHaveBeenCalledWith(
      expect.objectContaining({ path: targetPath }),
    );
    expect(mocks.transaction.delete).toHaveBeenCalledWith(
      expect.objectContaining({ path: overridePath }),
    );
    expect(mocks.transaction.set).not.toHaveBeenCalled();
  });

  test("目標已有同一學生或原時段已點名時拒絕移動", async () => {
    mocks.documents.set(sourcePath, { studentId: "student-1", ...source });
    mocks.documents.set(targetPath, { studentId: "student-1", ...target });

    await expect(moveScheduleEntryForDate("student-1", source, target))
      .rejects.toThrow("已經在目標時段");

    mocks.documents.delete(targetPath);
    mocks.documents.set(
      "attendance/2026-07-27__15%3A00__student-1",
      { studentId: "student-1", ...source },
    );

    await expect(moveScheduleEntryForDate("student-1", source, target))
      .rejects.toThrow("已完成點名");
  });
});
