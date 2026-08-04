import { beforeEach, describe, expect, test, vi } from "vitest";
import { SCHEDULE_SLOTS } from "../js/config.js";

const ensureScheduleWeek = vi.fn(() => Promise.resolve(false));
const addScheduleEntries = vi.fn(() => Promise.resolve(0));
const moveScheduleEntry = vi.fn(() => Promise.resolve());
const removeScheduleEntry = vi.fn(() => Promise.resolve());

vi.mock("../js/repositories/schedule-repository.js", () => ({
  addScheduleEntries,
  ensureScheduleWeek,
  moveScheduleEntry,
  removeScheduleEntry,
}));

const {
  bindSchedule,
  getSeasonNavigationDate,
  renderSchedule,
} = await import("../js/views/schedule.js");

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

function makeApp({ removeButton, seasonButtons = [] } = {}) {
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
      if (selector === '[data-action="switch-schedule-season"]') return seasonButtons;
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
  leaveRecords: [],
};

const allSeasonState = {
  ...state,
  seasons: [
    state.seasons[0],
    {
      id: "fall-2026",
      name: "2026 上學期",
      startDate: "2026-09-01",
      endDate: "2027-01-31",
      active: false,
    },
    {
      id: "winter-2027",
      name: "2027 寒假",
      startDate: "2027-02-01",
      endDate: "2027-02-28",
      active: false,
    },
    {
      id: "spring-2027",
      name: "2027 下學期",
      startDate: "2027-03-01",
      endDate: "2027-06-30",
      active: false,
    },
  ],
};

beforeEach(() => {
  const values = new Map([["mpm-selected-attendance-date", "2026-07-27"]]);
  vi.stubGlobal("localStorage", {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
  });
  ensureScheduleWeek.mockClear();
  addScheduleEntries.mockClear();
  moveScheduleEntry.mockClear();
  removeScheduleEntry.mockClear();
});

describe("schedule view", () => {
  test("左上角會顯示可切換的四個時期", () => {
    const html = renderSchedule(allSeasonState);
    expect(html).toContain('<div class="schedule-title-row"><h2>排課</h2><div class="schedule-season-switcher"');
    expect(html).toContain("2026 暑假");
    expect(html).toContain("2026 上學期");
    expect(html).toContain("2027 寒假");
    expect(html).toContain("2027 下學期");
    expect(html.match(/data-action="switch-schedule-season"/g)).toHaveLength(4);
    expect(html).toContain('id="schedule-season-select"');
    expect(html).not.toContain("每週獨立保存日期");
    expect(html).not.toContain("綠色標示為已有點名紀錄");
  });

  test("目前時期跳到今天，其他時期跳到開始日期", () => {
    const summer = allSeasonState.seasons[0];
    const fall = allSeasonState.seasons[1];
    const today = new Date(2026, 6, 29);
    expect(getSeasonNavigationDate(summer, today)).toBe(today);
    expect(getSeasonNavigationDate(fall, today)).toEqual(new Date(2026, 8, 1));
  });

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
    expect(html).toContain('class="schedule-board-layout without-saturday"');
    expect(html).toContain('class="schedule-editor palette-collapsed"');
    expect(html).toContain('class="schedule-desktop-board"');
    expect(html).toContain('class="schedule-mobile-board"');
    expect(html.match(/data-action="select-mobile-schedule-date"/g)).toHaveLength(5);
    expect(html.match(/class="schedule-mobile-slot"/g)).toHaveLength(4);
    expect(html).not.toContain("schedule-saturday-panel");
    expect(html).not.toContain("8/1 週六");
  });

  test("尚未開始的排課格顯示新增按鈕，過去或已有點名的格子不顯示", () => {
    const futureHtml = renderSchedule(state, {
      now: new Date("2026-07-20T00:00:00+08:00"),
    });
    expect(futureHtml.match(/data-action="add-schedule-students"/g)).toHaveLength(24);
    expect(futureHtml).toContain('data-date="2026-07-27" data-slot="15:00"');

    const attendedHtml = renderSchedule({
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
    }, {
      now: new Date("2026-07-20T00:00:00+08:00"),
    });
    expect(attendedHtml.match(/data-action="add-schedule-students"/g)).toHaveLength(23);
    expect(attendedHtml).not.toContain('data-action="add-schedule-students" data-date="2026-07-29" data-slot="15:00"');

    const pastHtml = renderSchedule(state, {
      now: new Date("2026-08-01T00:00:00+08:00"),
    });
    expect(pastHtml).not.toContain('data-action="add-schedule-students"');
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

    expect(html).toContain('class="schedule-cell has-attendance" data-date="2026-07-29"');
    expect(html).toContain("已到 1");
    expect(html).toContain("schedule-student is-present is-locked");
    expect(html).toContain('aria-disabled="true" title="已簽到，無法調整排課"');
  });

  test("請假學生顯示刪除線虛線狀態，但排課格不會視為已到班", () => {
    const html = renderSchedule({
      ...state,
      leaveRecords: [{
        id: "2026-07-29__15%3A00__student-1",
        studentId: "student-1",
        dateKey: "2026-07-29",
        slot: "15:00",
      }],
    }, {
      now: new Date("2026-07-20T00:00:00+08:00"),
    });

    expect(html).toContain("schedule-student is-on-leave is-locked");
    expect(html).toContain('<small class="schedule-leave-label">請假</small>');
    expect(html).toContain("請假 1");
    expect(html).toContain('aria-disabled="true" title="已請假，請先在今日點名取消請假"');
    expect(html).not.toContain('class="schedule-cell has-attendance" data-date="2026-07-29"');
    expect(html).not.toContain("已到 1");
    expect(html.match(/data-action="add-schedule-students"/g)).toHaveLength(24);
  });

  test("停課學生不會出現在排課名單或排課格", () => {
    const pausedState = {
      ...state,
      students: [
        ...state.students,
        { id: "student-paused", name: "停課生", grade: 1, status: "paused" },
      ],
      schedules: [{
        ...state.schedules[0],
        studentIds: ["student-1", "student-paused"],
      }],
    };
    const html = renderSchedule(pausedState);
    expect(html).toContain("敬澄");
    expect(html).not.toContain("停課生");
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

    expect(html).toContain("schedule-editor palette-collapsed is-delete-mode");
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
    expect(html).toContain("7/20 週一 — 7/24 週五");

    app.nextButton.click();
    expect(html).toContain("7/27 週一 — 7/31 週五");

    app.nextButton.click();
    expect(html).toContain("8/3 週一 — 8/7 週五");
  });

  test("切到其他時期會前往第一週並鎖定區間外日期", () => {
    let html = renderSchedule(allSeasonState);
    const fallButton = new FakeButton({ seasonId: "fall-2026" });
    const app = makeApp({ seasonButtons: [fallButton] });
    bindSchedule(app, allSeasonState, () => {
      html = renderSchedule(allSeasonState);
    }, vi.fn());

    fallButton.click();

    expect(html).toContain("8/31 週一 — 9/5 週六");
    expect(html).toContain("2026 上學期");
    expect(html).toContain("非此時期");
    expect(html).toContain("schedule-cell is-outside-season");
    expect(html).toContain("schedule-saturday-panel");
    expect(html).toContain("週六上午");
    expect(html).toContain("09:00–10:30");
    expect(html).toContain("10:30–12:00");
    expect(html).toContain('data-date="2026-09-05" data-slot="09:00"');
    expect(html).not.toContain('data-date="2026-09-05" data-slot="15:00"');
  });
});
