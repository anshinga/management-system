import { describe, expect, test } from "vitest";
import {
  groupScheduleEntries,
  makeScheduleEntryId,
  makeScheduleOverrideId,
} from "../js/domain/schedule.js";

describe("schedule domain", () => {
  test("排課文件 ID 對相同輸入保持穩定", () => {
    expect(makeScheduleEntryId({
      dateKey: "2026-07-27",
      slot: "16:30",
      studentId: "student/1",
    })).toBe("2026-07-27__16%3A30__student%2F1");
  });

  test("排課例外以週次、學期與學生唯一化", () => {
    expect(makeScheduleOverrideId({
      weekStart: "2026-07-27",
      seasonId: "summer-2026",
      studentId: "student-1",
      sourceWeekday: 1,
      sourceSlot: "16:30",
    })).toBe("2026-07-27__summer-2026__student-1__1__16%3A30");
  });

  test("排課文件可組合成既有畫面使用的時段資料", () => {
    expect(groupScheduleEntries([
      { studentId: "s2", seasonId: "summer", dateKey: "2026-07-28", slot: "18:00" },
      { studentId: "s1", seasonId: "summer", dateKey: "2026-07-27", slot: "16:30" },
      { studentId: "s3", seasonId: "summer", dateKey: "2026-07-27", slot: "16:30" },
      { studentId: "s1", seasonId: "summer", dateKey: "2026-07-27", slot: "16:30" },
    ])).toEqual([
      {
        id: "summer-2026-07-27-16:30",
        season: "summer",
        date: "2026-07-27",
        slot: "16:30",
        studentIds: ["s1", "s3"],
      },
      {
        id: "summer-2026-07-28-18:00",
        season: "summer",
        date: "2026-07-28",
        slot: "18:00",
        studentIds: ["s2"],
      },
    ]);
  });

  test("錯誤日期或時間不會產生文件 ID", () => {
    expect(() => makeScheduleEntryId({
      dateKey: "2026-02-30",
      slot: "16:30",
      studentId: "s1",
    })).toThrow("日期");
    expect(() => makeScheduleEntryId({
      dateKey: "2026-07-27",
      slot: "24:00",
      studentId: "s1",
    })).toThrow("時間");
  });
});
