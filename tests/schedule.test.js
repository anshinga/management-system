import { describe, expect, test } from "vitest";
import {
  buildCarryForwardEntries,
  getScheduleSlotsForWeekday,
  getSchedulePattern,
  getSeasonKind,
  groupScheduleEntries,
  hasSaturdayMorning,
  isBreakSeason,
  isScheduleSlotUpcoming,
  makeScheduleEntryId,
  makeScheduleOverrideId,
  makeSchedulePatternKey,
} from "../js/domain/schedule.js";

describe("schedule domain", () => {
  test("寒暑假只開平日下午，上下學期另開週六上午", () => {
    const summer = { id: "summer-2026", name: "2026 暑假" };
    const fall = { id: "fall-2026", name: "2026 上學期" };

    expect(getSeasonKind(summer)).toBe("summer");
    expect(isBreakSeason(summer)).toBe(true);
    expect(hasSaturdayMorning(summer)).toBe(false);
    expect(getScheduleSlotsForWeekday(summer, 6)).toEqual([]);
    expect(getScheduleSlotsForWeekday(summer, 1)).toEqual([
      "15:00",
      "16:30",
      "18:00",
      "19:30",
    ]);

    expect(getSeasonKind(fall)).toBe("fall");
    expect(hasSaturdayMorning(fall)).toBe(true);
    expect(getScheduleSlotsForWeekday(fall, 6)).toEqual(["09:00", "10:30"]);
    expect(getScheduleSlotsForWeekday(fall, 7)).toEqual([]);
  });

  test("新增排課只開放台北時間尚未開始的時段", () => {
    const beforeClass = new Date("2026-07-30T06:59:00.000Z");
    const classStarted = new Date("2026-07-30T07:00:00.000Z");

    expect(isScheduleSlotUpcoming("2026-07-30", "15:00", beforeClass)).toBe(true);
    expect(isScheduleSlotUpcoming("2026-07-30", "15:00", classStarted)).toBe(false);
    expect(isScheduleSlotUpcoming("2026-07-31", "15:00", classStarted)).toBe(true);
    expect(isScheduleSlotUpcoming("2026-07-29", "19:30", classStarted)).toBe(false);
  });

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

  test("相隔一週的相同時段會得到相同排課模式", () => {
    expect(getSchedulePattern({
      dateKey: "2026-07-27",
      slot: "16:30",
    })).toEqual({
      sourceWeekday: 1,
      sourceSlot: "16:30",
    });
    expect(makeSchedulePatternKey({
      studentId: "student-1",
      dateKey: "2026-08-03",
      slot: "16:30",
    })).toBe("student-1\u00001\u000016:30");
  });

  test("沿用前一週時略過既有排課與已刪除的例外", () => {
    expect(buildCarryForwardEntries({
      previousEntries: [
        { studentId: "s1", seasonId: "summer", dateKey: "2026-07-27", slot: "16:30" },
        { studentId: "s2", seasonId: "summer", dateKey: "2026-07-28", slot: "18:00" },
        { studentId: "s3", seasonId: "summer", dateKey: "2026-07-29", slot: "19:00" },
        { studentId: "s4", seasonId: "summer", dateKey: "2026-07-30", slot: "15:00", temporary: true },
      ],
      currentEntries: [
        { studentId: "s1", seasonId: "summer", dateKey: "2026-08-03", slot: "16:30" },
      ],
      overrides: [
        { studentId: "s2", sourceWeekday: 2, sourceSlot: "18:00" },
      ],
      seasonId: "summer",
    })).toEqual([
      { studentId: "s3", seasonId: "summer", dateKey: "2026-08-05", slot: "19:00" },
    ]);
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

  test("臨時排課會保留在當日分組，但不會沿用到下一週", () => {
    const temporaryEntry = {
      studentId: "s1",
      seasonId: "summer",
      dateKey: "2026-07-27",
      slot: "16:30",
      temporary: true,
    };
    expect(buildCarryForwardEntries({
      previousEntries: [temporaryEntry],
      seasonId: "summer",
    })).toEqual([]);
    expect(groupScheduleEntries([temporaryEntry])).toEqual([{
      id: "summer-2026-07-27-16:30",
      season: "summer",
      date: "2026-07-27",
      slot: "16:30",
      studentIds: ["s1"],
      temporaryStudentIds: ["s1"],
    }]);
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
