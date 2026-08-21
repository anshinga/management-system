import { beforeEach, describe, expect, test, vi } from "vitest";

const { getAttendanceAnalyticsRecordsMock } = vi.hoisted(() => ({
  getAttendanceAnalyticsRecordsMock: vi.fn(),
}));

vi.mock("../js/repositories/analytics-repository.js", () => ({
  clearAttendanceAnalyticsCache: vi.fn(),
  getAttendanceAnalyticsRecords: getAttendanceAnalyticsRecordsMock,
}));

const {
  bindAnalytics,
  renderAnalytics,
  resetAnalyticsView,
} = await import("../js/views/analytics.js");

function makeApp() {
  const listeners = {};
  const weekSelect = {
    value: "8",
    addEventListener(type, listener) {
      listeners[`select:${type}`] = listener;
    },
  };
  const form = {
    elements: { weekCount: weekSelect },
    addEventListener(type, listener) {
      listeners[`form:${type}`] = listener;
    },
  };
  return {
    listeners,
    querySelector(selector) {
      if (selector === "[data-analytics-form]") return form;
      if (selector === "[data-analytics-weeks]") return weekSelect;
      return null;
    },
  };
}

describe("analytics view", () => {
  beforeEach(() => {
    resetAnalyticsView();
    getAttendanceAnalyticsRecordsMock.mockReset().mockResolvedValue({
      records: [],
      readCount: 0,
      fetchedAt: new Date("2026-08-21T08:00:00.000Z"),
      fromMemoryCache: false,
    });
  });

  test("初次開啟只顯示讀取說明，不會自行查詢", () => {
    const app = makeApp();
    const html = renderAnalytics({ students: [] }, { todayDate: "2026-08-21" });
    bindAnalytics(app, vi.fn());

    expect(html).toContain("尚未讀取歷史點名資料");
    expect(html).toContain("最近 8 週");
    expect(getAttendanceAnalyticsRecordsMock).not.toHaveBeenCalled();
  });

  test("按下開始分析後才讀取八週日期範圍", async () => {
    const app = makeApp();
    const refresh = vi.fn();
    bindAnalytics(app, refresh);

    await app.listeners["form:submit"]({ preventDefault: vi.fn() });

    expect(getAttendanceAnalyticsRecordsMock).toHaveBeenCalledWith({
      startDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      endDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      weekCount: 8,
      weeks: expect.any(Array),
    }, { force: false });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  test("成功畫面排除停課學生並顯示每週、時段與明細", () => {
    const range = {
      startDate: "2026-08-10",
      endDate: "2026-08-21",
      weekCount: 2,
      weeks: [
        { startDate: "2026-08-10", endDate: "2026-08-16", label: "8/10–8/16", shortLabel: "8/10", isInProgress: false },
        { startDate: "2026-08-17", endDate: "2026-08-23", label: "8/17–8/23", shortLabel: "8/17", isInProgress: true },
      ],
    };
    const html = renderAnalytics({
      students: [
        { id: "active", status: "active" },
        { id: "paused", status: "paused" },
      ],
    }, {
      todayDate: "2026-08-21",
      viewState: {
        weekCount: 2,
        status: "success",
        range,
        records: [
          { studentId: "active", dateKey: "2026-08-17", slot: "15:00" },
          { studentId: "paused", dateKey: "2026-08-18", slot: "15:00" },
        ],
        readCount: 2,
        fetchedAt: new Date("2026-08-21T08:00:00.000Z"),
        fromMemoryCache: false,
        error: "",
      },
    });

    expect(html).toContain("每週總人次");
    expect(html).toContain("各時段上課人次");
    expect(html).toContain("每週人次明細");
    expect(html).toContain("8/17–8/23，1 人次，進行中");
    expect(html).toContain(">1</strong>");
    expect(html).toContain("本次讀取 2 筆點名紀錄");
    expect(html).not.toContain("平均");
  });
});
