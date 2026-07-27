import { beforeEach, describe, expect, test, vi } from "vitest";

const ensureScheduleWeek = vi.fn(() => Promise.resolve(false));
const moveScheduleEntry = vi.fn(() => Promise.resolve());
const removeScheduleEntry = vi.fn(() => Promise.resolve());

vi.mock("../js/repositories/schedule-repository.js", () => ({
  ensureScheduleWeek,
  moveScheduleEntry,
  removeScheduleEntry,
}));

const { bindSchedule, renderSchedule } = await import("../js/views/schedule.js");

class FakeButton {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.disabled = false;
    this.listeners = {};
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  click() {
    return this.listeners.click?.();
  }
}

function makeApp({ removeButton } = {}) {
  const toggleButton = new FakeButton();
  return {
    toggleButton,
    querySelector(selector) {
      if (selector === '[data-action="toggle-delete-mode"]') return toggleButton;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-action="remove-schedule-student"]' && removeButton) {
        return [removeButton];
      }
      return [];
    },
  };
}

const state = {
  students: [
    { id: "student-1", name: "敬澄", grade: 1, status: "active" },
  ],
  seasons: [
    {
      id: "summer-2026",
      name: "2026 暑假",
      startDate: "2026-07-01",
      endDate: "2026-08-31",
      active: true,
    },
  ],
  schedules: [
    {
      id: "summer-2026-2026-07-29-15:00",
      season: "summer-2026",
      date: "2026-07-29",
      slot: "15:00",
      studentIds: ["student-1"],
    },
  ],
  attendance: [],
};

beforeEach(() => {
  const values = new Map([["mpm-selected-attendance-date", "2026-07-27"]]);
  vi.stubGlobal("localStorage", {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
  });
  ensureScheduleWeek.mockClear();
  moveScheduleEntry.mockClear();
  removeScheduleEntry.mockClear();
});

describe("schedule view", () => {
  test("鉛筆按鈕會切換刪除模式並顯示移除操作", () => {
    let html = renderSchedule(state);
    expect(html).toContain("✎");
    expect(html).toContain("修改排課");
    expect(html).not.toContain('data-action="remove-schedule-student"');

    const app = makeApp();
    bindSchedule(app, state, () => {
      html = renderSchedule(state);
    }, vi.fn());
    app.toggleButton.click();

    expect(html).toContain("刪除模式");
    expect(html).toContain("完成");
    expect(html).toContain('data-action="remove-schedule-student"');

    app.toggleButton.click();
  });

  test("刪除模式會把所選學生與時段交給資料層移除", async () => {
    const toggleApp = makeApp();
    bindSchedule(toggleApp, state, vi.fn(), vi.fn());
    toggleApp.toggleButton.click();

    const removeButton = new FakeButton({
      studentId: "student-1",
      studentName: "敬澄",
      date: "2026-07-29",
      slot: "15:00",
      season: "summer-2026",
    });
    const app = makeApp({ removeButton });
    bindSchedule(app, state, vi.fn(), vi.fn());

    await removeButton.click();

    expect(removeScheduleEntry).toHaveBeenCalledWith("student-1", {
      dateKey: "2026-07-29",
      slot: "15:00",
      seasonId: "summer-2026",
    });

    app.toggleButton.click();
  });
});
