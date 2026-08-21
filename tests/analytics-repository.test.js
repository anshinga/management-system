import { beforeEach, describe, expect, test, vi } from "vitest";

const { getDocsMock } = vi.hoisted(() => ({
  getDocsMock: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  getDocs: getDocsMock,
  query: (reference, ...constraints) => ({ reference, constraints }),
  where: (field, operator, value) => ({ field, operator, value }),
}));

vi.mock("../js/repositories/firestore-paths.js", () => ({
  COLLECTIONS: { attendance: "attendance" },
  workspaceCollectionRef: (name) => ({ name }),
}));

const {
  clearAttendanceAnalyticsCache,
  getAttendanceAnalyticsRecords,
} = await import("../js/repositories/analytics-repository.js");

function snapshot(records = []) {
  return {
    docs: records.map((record, index) => ({
      id: `record-${index + 1}`,
      data: () => record,
    })),
  };
}

describe("analytics repository", () => {
  beforeEach(() => {
    clearAttendanceAnalyticsCache();
    getDocsMock.mockReset().mockResolvedValue(snapshot([
      { studentId: "student-1", dateKey: "2026-08-17", slot: "15:00" },
    ]));
  });

  test("只依指定日期範圍執行一次性點名查詢", async () => {
    const result = await getAttendanceAnalyticsRecords({
      startDate: "2026-06-29",
      endDate: "2026-08-21",
    });

    expect(getDocsMock).toHaveBeenCalledOnce();
    expect(getDocsMock.mock.calls[0][0].constraints).toEqual([
      { field: "dateKey", operator: ">=", value: "2026-06-29" },
      { field: "dateKey", operator: "<=", value: "2026-08-21" },
    ]);
    expect(result.readCount).toBe(1);
    expect(result.fromMemoryCache).toBe(false);
  });

  test("相同範圍使用記憶體快取，重新分析才再次讀取", async () => {
    const range = { startDate: "2026-06-29", endDate: "2026-08-21" };
    await getAttendanceAnalyticsRecords(range);
    const cached = await getAttendanceAnalyticsRecords(range);
    await getAttendanceAnalyticsRecords(range, { force: true });

    expect(cached.fromMemoryCache).toBe(true);
    expect(getDocsMock).toHaveBeenCalledTimes(2);
  });

  test("超過十三週時在讀取 Firestore 前拒絕查詢", async () => {
    await expect(getAttendanceAnalyticsRecords({
      startDate: "2026-05-18",
      endDate: "2026-08-17",
    })).rejects.toThrow("最多只能讀取 13 週");
    expect(getDocsMock).not.toHaveBeenCalled();
  });
});
