import { describe, expect, test } from "vitest";
import {
  buildAnalyticsDateRange,
  buildAttendanceAnalyticsModel,
  normalizeAnalyticsWeekCount,
  validateAnalyticsDateRange,
} from "../js/domain/analytics.js";

describe("attendance analytics domain", () => {
  test("預設週期從星期一開始並包含進行中的本週", () => {
    const range = buildAnalyticsDateRange(8, "2026-08-21");

    expect(range.startDate).toBe("2026-06-29");
    expect(range.endDate).toBe("2026-08-21");
    expect(range.weeks).toHaveLength(8);
    expect(range.weeks[0]).toMatchObject({
      startDate: "2026-06-29",
      endDate: "2026-07-05",
      isInProgress: false,
    });
    expect(range.weeks.at(-1)).toMatchObject({
      startDate: "2026-08-17",
      endDate: "2026-08-23",
      isInProgress: true,
    });
  });

  test("單次分析最多允許十三週", () => {
    expect(normalizeAnalyticsWeekCount(13)).toBe(13);
    expect(() => normalizeAnalyticsWeekCount(14)).toThrow("1 至 13 週");
    expect(() => validateAnalyticsDateRange("2026-05-18", "2026-08-17"))
      .toThrow("最多只能讀取 13 週");
  });

  test("只統計目前在讀學生並按週次與時段累計人次", () => {
    const range = buildAnalyticsDateRange(4, "2026-08-21");
    const model = buildAttendanceAnalyticsModel({
      students: [
        { id: "active", status: "active" },
        { id: "paused", status: "paused" },
      ],
      attendance: [
        { studentId: "active", dateKey: "2026-08-03", slot: "15:00" },
        { studentId: "active", dateKey: "2026-08-03", slot: "16:30" },
        { studentId: "active", dateKey: "2026-08-17", slot: "15:00" },
        { studentId: "paused", dateKey: "2026-08-18", slot: "15:00" },
        { studentId: "active", dateKey: "2026-07-20", slot: "15:00" },
      ],
    }, range);

    expect(model.total).toBe(3);
    expect(model.recordsRead).toBe(5);
    expect(model.slotTotals["15:00"]).toBe(2);
    expect(model.slotTotals["16:30"]).toBe(1);
    expect(model.weeks.map((week) => week.total)).toEqual([0, 2, 0, 1]);
    expect(model.maxWeeklyTotal).toBe(2);
  });

  test("保留既有設定外的有效歷史時段，避免週總數與時段合計不一致", () => {
    const range = buildAnalyticsDateRange(1, "2026-08-21");
    const model = buildAttendanceAnalyticsModel({
      students: [{ id: "active", status: "active" }],
      attendance: [
        { studentId: "active", dateKey: "2026-08-20", slot: "13:30" },
      ],
    }, range);

    expect(model.slots.at(-1)).toBe("13:30");
    expect(model.slotTotals["13:30"]).toBe(1);
    expect(model.weeks[0].total).toBe(1);
  });
});
