import { beforeEach, describe, expect, test, vi } from "vitest";
import { SCHEDULE_SLOTS } from "../js/config.js";

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
  const previousButton = new FakeButton();
  const nextButton = new FakeButton();
  const currentWeekButton = new FakeButton();
  return {
    toggleButton,
    previousButton,
    nextButton,
    currentWeekButton,
    querySelector(selector) {
      if (selector === '[data-action="toggle-delete-mode"]') return toggleButton;
      if (selector === '[data-action="prev-week"]') return previousButton;
      if (selector === '[data-action="next-week"]') return nextButton;
      if (selector === '[data-action="current-week"]') return currentWeekButton;
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
  test("排課與點名共用四個 90 分鐘時段，最後一堂於 21:00 結束", () => {
    expect(SCHEDULE_SLOTS).toEqual([
      "15:00",
      "16:30",
      "18:00",
      "19:30",
    ]);
    const html = renderSchedule(state);
    expect(html).toContain(">19:30<");
    expect(html).not.toContain(">19:00<");
    expect(html).not.toContain(">21:00<");
  });

  test("過去已有點名的時段與學生會保持綠色及鎖定", () => {
    const attendedState = {
      ...state,
      attendance: [{
        id: "2026-07-29__15%3A00__student-1",
        studentId: "student-1",
        dateKey: "2026-07-29",
        slot: "15:00",
        arrivalTime: "14:55",
        lessonNumber: 1,
        term: 1,
      }],
    };
    const html = renderSchedule(attendedState);

    expect(html).toContain("綠色標示為已有點名紀錄，無法調整");
    expect(html).toContain('class="schedule-cell has-attendance" data-date="2026-07-29"');
    expect(html).toContain("已到 1");
    expect(html).toContain("schedule-student is-present is-locked");
    expect(html).toContain('aria-disabled="true" title="已簽到，無法調整排課"');
  });

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

  test("左右切週按鈕會立即切換畫面，不等待 Firebase 沿用完成", () => {
    let html = renderSchedule(state);
    const app = makeApp();
    bindSchedule(app, state, () => {
      html = renderSchedule(state);
    }, vi.fn());

    app.previousButton.click();
    expect(html).toContain("7/20 週一 — 7/25 週六");

    app.nextButton.click();
    expect(html).toContain("7/27 週一 — 8/1 週六");

    app.nextButton.click();
    expect(html).toContain("8/3 週一 — 8/8 週六");
  });
});
