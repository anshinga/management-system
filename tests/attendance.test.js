import { describe, expect, test } from "vitest";
import { makeAttendanceId, makeBillingCycleId } from "../js/domain/attendance.js";

describe("attendance domain", () => {
  test("同一學生、日期與時段只會得到一個點名 ID", () => {
    expect(makeAttendanceId({
      studentId: "student-1",
      dateKey: "2026-07-27",
      slot: "16:30",
    })).toBe("2026-07-27__16%3A30__student-1");
  });

  test("每位學生的每一期只有一個付款期別", () => {
    expect(makeBillingCycleId("student-1", 3)).toBe("student-1__3");
  });

  test("無效日期與期數會被拒絕", () => {
    expect(() => makeAttendanceId({
      studentId: "student-1",
      dateKey: "2026-02-30",
      slot: "16:30",
    })).toThrow("日期");
    expect(() => makeBillingCycleId("student-1", 0)).toThrow("期別");
  });
});
