import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../js/repositories/attendance-repository.js", () => ({
  markAttendance: vi.fn(),
  removeLatestAttendance: vi.fn(),
  updateAttendanceTime: vi.fn(),
}));

vi.mock("../js/repositories/schedule-repository.js", () => ({
  addTemporaryScheduleEntries: vi.fn(),
  ensureScheduleWeek: vi.fn(() => Promise.resolve(false)),
}));

const { renderRollCall } = await import("../js/views/roll-call.js");

const state = {
  students: [],
  seasons: [{
    id: "summer-2026",
    name: "2026 暑假",
    startDate: "2026-07-01",
    endDate: "2026-08-31",
    active: true,
  }],
  schedules: [],
  attendance: [],
  billingCycles: [],
};

beforeEach(() => {
  const values = new Map([["mpm-selected-attendance-date", "2026-07-27"]]);
  vi.stubGlobal("localStorage", {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
  });
});

describe("roll-call view", () => {
  test("四個時段都顯示臨時加入學生的方塊", () => {
    const html = renderRollCall(state);
    expect(html.match(/data-action="add-temporary-students"/g)).toHaveLength(4);
    expect(html).toContain(">15:00<");
    expect(html).toContain(">16:30<");
    expect(html).toContain(">18:00<");
    expect(html).toContain(">19:30<");
    expect(html).toContain("只加入本日，不會立即點名");
  });

  test("停課學生即使保留排課也不會出現在點名畫面", () => {
    const html = renderRollCall({
      ...state,
      students: [
        { id: "active", name: "在讀生", grade: 1, status: "active" },
        { id: "paused", name: "停課生", grade: 1, status: "paused" },
      ],
      schedules: [{
        id: "summer-2026-2026-07-27-15:00",
        season: "summer-2026",
        date: "2026-07-27",
        slot: "15:00",
        studentIds: ["active", "paused"],
      }],
      attendance: [{
        id: "2026-07-27__15%3A00__paused",
        studentId: "paused",
        dateKey: "2026-07-27",
        slot: "15:00",
        arrivalTime: "14:58",
      }],
    });
    expect(html).toContain("在讀生");
    expect(html).not.toContain("停課生");
    expect(html).toContain('<div class="stat-value">1</div>');
    expect(html).toContain('<div class="stat-label">當日已到班</div><div class="stat-value">0</div>');
  });
});
