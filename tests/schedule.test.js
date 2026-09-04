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

  test("單日覆寫會隱藏原時段，但保留移入時段的臨時排課", () => {
    const originalEntry = {
      studentId: "s1",
      seasonId: "summer",
      dateKey: "2026-07-27",
      slot: "15:00",
    };
    const movedEntry = {
      studentId: "s1",
      seasonId: "summer",
      dateKey: "2026-07-27",
      slot: "16:30",
      temporary: true,
    };
    const overrides = [{
      studentId: "s1",
      seasonId: "summer",
      weekStart: "2026-07-27",
      sourceWeekday: 1,
      sourceSlot: "15:00",
    }];

    expect(groupScheduleEntries([originalEntry, movedEntry], overrides)).toEqual([{
      id: "summer-2026-07-27-16:30",
      season: "summer",
      date: "2026-07-27",
      slot: "16:30",
      studentIds: ["s1"],
      temporaryStudentIds: ["s1"],
    }]);
    expect(buildCarryForwardEntries({
      previousEntries: [originalEntry, movedEntry],
      seasonId: "summer",
    })).toEqual([{
      studentId: "s1",
      seasonId: "summer",
      dateKey: "2026-08-03",
      slot: "15:00",
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

describe("排課重建後的舊例外", () => {
  const timestamp = (iso) => ({ toMillis: () => Date.parse(iso) });
  const entry = {
    studentId: "s1", seasonId: "fall-2026", dateKey: "2026-09-02", slot: "15:00",
    createdAt: timestamp("2026-08-26T07:24:16.795Z"),
  };
  const override = {
    studentId: "s1", seasonId: "fall-2026", weekStart: "2026-08-31",
    sourceWeekday: 3, sourceSlot: "15:00",
    createdAt: timestamp("2026-08-26T07:23:58.189Z"),
    updatedAt: timestamp("2026-08-26T07:23:58.189Z"),
  };

  test("9/2、9/9 的排課比舊例外晚建立時，應與 9/16 一樣正常顯示", () => {
    const entries = [entry, {
      ...entry, dateKey: "2026-09-09", createdAt: timestamp("2026-08-26T07:28:39.317Z"),
    }, { ...entry, dateKey: "2026-09-16", createdAt: timestamp("2026-08-26T07:43:24.260Z") }];
    const overrides = [override, {
      ...override, weekStart: "2026-09-07",
      createdAt: timestamp("2026-08-26T07:28:27.278Z"),
      updatedAt: timestamp("2026-08-26T07:28:27.278Z"),
    }];
    expect(groupScheduleEntries(entries, overrides).map(cell => cell.date))
      .toEqual(["2026-09-02", "2026-09-09", "2026-09-16"]);
  });

  test("重新排課後若再次單日調課，較晚的例外仍須隱藏原時段", () => {
    expect(groupScheduleEntries([entry], [{
      ...override, updatedAt: timestamp("2026-09-02T06:57:40.783Z"),
    }])).toEqual([]);
  });

  test("一般更新不能使被調走的排課重新出現，判斷須用建立時間", () => {
    expect(groupScheduleEntries([{
      ...entry, createdAt: timestamp("2026-08-26T07:20:00.000Z"),
      updatedAt: timestamp("2026-08-26T07:30:00.000Z"),
    }], [override])).toEqual([]);
  });

  test("相同時間、未完成伺服器時間及不完整舊資料，維持例外有效", () => {
    for (const createdAt of [override.updatedAt, null, undefined, "invalid"]) {
      expect(groupScheduleEntries([{ ...entry, createdAt }], [override])).toEqual([]);
    }
    expect(groupScheduleEntries([entry], [{ ...override, updatedAt: null }])).toEqual([]);
  });

  test("可判讀序列化時間戳記，且不更動來源資料", () => {
    const value = Date.parse("2026-08-26T07:24:16.795Z");
    const original = {
      ...entry, createdAt: { seconds: Math.floor(value / 1000), nanoseconds: (value % 1000) * 1e6 },
    };
    const exclusion = { ...override, createdAt: "2026-08-26T07:23:58.189Z", updatedAt: "2026-08-26T07:23:58.189Z" };
    const before = JSON.stringify([original, exclusion]);
    expect(groupScheduleEntries([original], [exclusion])[0]?.studentIds).toEqual(["s1"]);
    expect(JSON.stringify([original, exclusion])).toBe(before);
  });
});
