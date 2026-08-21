import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  beginDailySession,
  getSelectedAttendanceDate,
  getTodayDate,
  setSelectedAttendanceDate,
} from "../js/store.js";

describe("daily session store", () => {
  let values;

  beforeEach(() => {
    values = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, String(value)),
    });
  });

  test("今天依台北時區計算", () => {
    expect(getTodayDate(new Date("2026-08-20T16:30:00.000Z"))).toBe("2026-08-21");
  });

  test("同一天再次啟用不重設，跨日才要求回到今日點名", () => {
    expect(beginDailySession("2026-08-21")).toBe(true);
    expect(beginDailySession("2026-08-21")).toBe(false);
    expect(beginDailySession("2026-08-22")).toBe(true);
    expect(values.get("mpm-last-active-date")).toBe("2026-08-22");
  });

  test("跨日重設時可把歷史點名日期切回今天", () => {
    values.set("mpm-selected-attendance-date", "2026-08-20");
    vi.setSystemTime(new Date("2026-08-21T04:00:00.000Z"));

    expect(setSelectedAttendanceDate("2026-08-21")).toBe("2026-08-21");
    expect(getSelectedAttendanceDate()).toBe("2026-08-21");

    vi.useRealTimers();
  });
});
