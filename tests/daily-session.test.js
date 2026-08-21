import { describe, expect, test, vi } from "vitest";
import { createDailyRollCallReset } from "../js/daily-session.js";

function setup(shouldReset) {
  const dependencies = {
    beginDailySession: vi.fn(() => shouldReset),
    getTodayDate: vi.fn(() => "2026-08-21"),
    setSelectedAttendanceDate: vi.fn(),
    replaceRoute: vi.fn(),
    applyRoute: vi.fn(),
  };
  return {
    dependencies,
    reset: createDailyRollCallReset(dependencies),
  };
}

describe("daily roll-call reset", () => {
  test("跨日後把點名日期與頁面一起切回今天", () => {
    const { dependencies, reset } = setup(true);

    expect(reset()).toBe(true);
    expect(dependencies.beginDailySession).toHaveBeenCalledWith("2026-08-21");
    expect(dependencies.setSelectedAttendanceDate).toHaveBeenCalledWith("2026-08-21");
    expect(dependencies.replaceRoute).toHaveBeenCalledWith("roll-call");
    expect(dependencies.applyRoute).toHaveBeenCalledWith("roll-call");
  });

  test("同一天恢復頁面時保留目前操作", () => {
    const { dependencies, reset } = setup(false);

    expect(reset()).toBe(false);
    expect(dependencies.setSelectedAttendanceDate).not.toHaveBeenCalled();
    expect(dependencies.replaceRoute).not.toHaveBeenCalled();
    expect(dependencies.applyRoute).not.toHaveBeenCalled();
  });
});
