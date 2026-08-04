import { beforeEach, describe, expect, test, vi } from "vitest";

const moveScheduleEntryForDateMock = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));

vi.mock("../js/repositories/attendance-repository.js", () => ({
  markAttendance: vi.fn(),
  removeLatestAttendance: vi.fn(),
  updateAttendanceTime: vi.fn(),
}));

vi.mock("../js/repositories/leave-repository.js", () => ({
  cancelStudentLeave: vi.fn(),
  markStudentLeave: vi.fn(),
}));

vi.mock("../js/repositories/schedule-repository.js", () => ({
  addTemporaryScheduleEntries: vi.fn(),
  ensureScheduleWeek: vi.fn(() => Promise.resolve(false)),
  moveScheduleEntryForDate: moveScheduleEntryForDateMock,
}));

const {
  bindRollCall,
  renderRollCall,
  renderTemporaryStudentOption,
  shouldAutoFocusTemporaryStudentSearch,
} = await import("../js/views/roll-call.js");

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
  leaveRecords: [],
  billingCycles: [],
};

beforeEach(() => {
  const values = new Map([["mpm-selected-attendance-date", "2026-07-27"]]);
  vi.stubGlobal("localStorage", {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
  });
  moveScheduleEntryForDateMock.mockClear();
});

class FakeDragElement {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.listeners = {};
    this.attributes = new Map();
    this.classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      remove: (...names) => names.forEach((name) => this.classes.delete(name)),
      toggle: (name, force) => {
        if (force) this.classes.add(name);
        else this.classes.delete(name);
      },
    };
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }
}

function selectAttendanceDate(dateKey) {
  localStorage.setItem("mpm-selected-attendance-date", dateKey);
}

describe("roll-call view", () => {
  test("臨時學生選項將年級與堂數分開以支援手機精簡顯示", () => {
    const html = renderTemporaryStudentOption({
      id: "student-1",
      name: "測試學生",
      grade: 5,
      currentLessonCount: 12,
    });

    expect(html).toContain("測試學生");
    expect(html).toContain("5 年級");
    expect(html).toContain('<span class="temporary-student-lesson">・第 12 / 24 堂</span>');
  });

  test("臨時學生搜尋只在桌面版自動聚焦", () => {
    expect(shouldAutoFocusTemporaryStudentSearch({
      matchMedia: () => ({ matches: false }),
    })).toBe(false);
    expect(shouldAutoFocusTemporaryStudentSearch({
      matchMedia: () => ({ matches: true }),
    })).toBe(true);
  });

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

  test("學生卡片顯示精簡堂數，年級在姓名右側，欠費只標紅姓名", () => {
    const html = renderRollCall({
      ...state,
      students: [{
        id: "student-1",
        name: "允涵",
        grade: 7,
        status: "active",
        currentLessonCount: 16,
        currentTerm: 2,
        paymentPending: true,
        pendingPaymentCount: 1,
      }],
      schedules: [{
        id: "summer-2026-2026-07-27-15:00",
        season: "summer-2026",
        date: "2026-07-27",
        slot: "15:00",
        studentIds: ["student-1"],
      }],
      attendance: [{
        id: "2026-07-27__15%3A00__student-1",
        studentId: "student-1",
        dateKey: "2026-07-27",
        slot: "15:00",
        arrivalTime: "15:12",
        lessonNumber: 16,
      }],
    });

    expect(html).toContain('<div class="student-name is-payment-pending">允涵</div><span class="grade-badge">7 年級</span>');
    expect(html).toContain('<div class="student-subtitle">第 16 堂</div>');
    expect(html).toContain('<div class="roll-call-mobile-meta">16 / 15:12</div>');
    expect(html).toContain('<span class="roll-call-desktop-label">修改點名</span><span class="roll-call-mobile-label">修改</span>');
    expect(html).not.toContain("/ 24");
    expect(html).not.toContain("第 2 期");
    expect(html).not.toContain("期待付款");
    expect(html).not.toContain("pending-badge");
  });

  test("未點名學生可拖曳調整本日時段，已點名學生保持鎖定", () => {
    const baseStudent = {
      id: "student-1",
      name: "允涵",
      grade: 7,
      status: "active",
      currentLessonCount: 12,
      currentTerm: 1,
    };
    const schedule = {
      id: "summer-2026-2026-07-27-15:00",
      season: "summer-2026",
      date: "2026-07-27",
      slot: "15:00",
      studentIds: ["student-1"],
      temporaryStudentIds: ["student-1"],
    };
    const pendingHtml = renderRollCall({
      ...state,
      students: [baseStudent],
      schedules: [schedule],
    });

    expect(pendingHtml).toContain('class="student-card roll-call-student-card is-draggable" draggable="true"');
    expect(pendingHtml).toContain('data-roll-call-student="student-1"');
    expect(pendingHtml).toContain('data-roll-call-temporary="true"');
    expect(pendingHtml).toContain('data-action="drag-roll-call-student"');
    expect(pendingHtml.match(/data-roll-call-drop-slot=/g)).toHaveLength(4);

    const attendedHtml = renderRollCall({
      ...state,
      students: [baseStudent],
      schedules: [schedule],
      attendance: [{
        id: "2026-07-27__15%3A00__student-1",
        studentId: "student-1",
        dateKey: "2026-07-27",
        slot: "15:00",
        arrivalTime: "15:02",
        lessonNumber: 12,
      }],
    });

    expect(attendedHtml).toContain('class="student-card roll-call-student-card is-present"');
    expect(attendedHtml).not.toContain('data-roll-call-student="student-1"');
    expect(attendedHtml).not.toContain('data-action="drag-roll-call-student"');
  });

  test("請假不增加堂數，卡片顯示刪除線狀態並可取消請假", () => {
    const leaveState = {
      ...state,
      students: [{
        id: "student-1",
        name: "允涵",
        grade: 7,
        status: "active",
        currentLessonCount: 12,
        currentTerm: 1,
      }],
      schedules: [{
        id: "summer-2026-2026-07-27-15:00",
        season: "summer-2026",
        date: "2026-07-27",
        slot: "15:00",
        studentIds: ["student-1"],
      }],
      leaveRecords: [{
        id: "2026-07-27__15%3A00__student-1",
        studentId: "student-1",
        dateKey: "2026-07-27",
        slot: "15:00",
      }],
    };
    const html = renderRollCall(leaveState);

    expect(html).toContain('class="student-card roll-call-student-card is-on-leave"');
    expect(html).toContain('<div class="student-name">允涵</div>');
    expect(html).toContain('<div class="student-subtitle">第 12 堂</div>');
    expect(html).toContain('<div class="roll-call-mobile-meta">12 / 請假</div>');
    expect(html).toContain('<span class="leave-status">請假</span>');
    expect(html).toContain('data-action="cancel-leave"');
    expect(html).toContain('<div class="stat-note">請假 1 人次</div>');
    expect(html).not.toContain('data-roll-call-student="student-1"');
    expect(html).not.toContain('data-action="attend" data-student-id="student-1"');
  });

  test("同一學生同一天兩堂課可分別請假與到班", () => {
    const html = renderRollCall({
      ...state,
      students: [{
        id: "student-1",
        name: "允涵",
        grade: 7,
        status: "active",
        currentLessonCount: 12,
        currentTerm: 1,
      }],
      schedules: [
        {
          id: "summer-2026-2026-07-27-15:00",
          season: "summer-2026",
          date: "2026-07-27",
          slot: "15:00",
          studentIds: ["student-1"],
        },
        {
          id: "summer-2026-2026-07-27-16:30",
          season: "summer-2026",
          date: "2026-07-27",
          slot: "16:30",
          studentIds: ["student-1"],
        },
      ],
      leaveRecords: [{
        id: "2026-07-27__15%3A00__student-1",
        studentId: "student-1",
        dateKey: "2026-07-27",
        slot: "15:00",
      }],
    });

    expect(html.match(/roll-call-student-card is-on-leave/g)).toHaveLength(1);
    expect(html.match(/data-action="attend" data-student-id="student-1"/g)).toHaveLength(1);
    expect(html.match(/data-action="leave" data-student-id="student-1"/g)).toHaveLength(1);
  });

  test("桌面拖放會呼叫只影響當日的排課移動", async () => {
    const card = new FakeDragElement({
      rollCallStudent: "student-1",
      rollCallDate: "2026-07-27",
      rollCallSlot: "15:00",
      rollCallSeason: "summer-2026",
      rollCallTemporary: "false",
    });
    const sourceZone = new FakeDragElement({
      rollCallDate: "2026-07-27",
      rollCallDropSlot: "15:00",
      rollCallSeason: "summer-2026",
    });
    const targetZone = new FakeDragElement({
      rollCallDate: "2026-07-27",
      rollCallDropSlot: "16:30",
      rollCallSeason: "summer-2026",
    });
    const app = {
      querySelector: () => null,
      querySelectorAll: (selector) => {
        if (selector === "[data-roll-call-student]") return [card];
        if (selector === "[data-roll-call-drop-slot]") return [sourceZone, targetZone];
        return [];
      },
    };
    const showToast = vi.fn();
    bindRollCall(app, {
      ...state,
      students: [{ id: "student-1", name: "允涵", status: "active" }],
      schedules: state.schedules,
    }, vi.fn(), showToast);

    card.listeners.dragstart({
      target: { closest: () => null },
      preventDefault: vi.fn(),
      dataTransfer: {
        effectAllowed: "",
        setData: vi.fn(),
      },
    });
    await targetZone.listeners.drop({ preventDefault: vi.fn() });

    expect(moveScheduleEntryForDateMock).toHaveBeenCalledWith(
      "student-1",
      {
        dateKey: "2026-07-27",
        slot: "15:00",
        seasonId: "summer-2026",
      },
      {
        dateKey: "2026-07-27",
        slot: "16:30",
        seasonId: "summer-2026",
      },
    );
    expect(showToast).toHaveBeenCalledWith("已將 允涵 移到 16:30，只調整本日");
  });

  test("舊資料完成第 20 堂但尚無提醒文件時，姓名仍會顯示紅色", () => {
    const html = renderRollCall({
      ...state,
      students: [{
        id: "student-1",
        name: "允涵",
        grade: 7,
        status: "active",
        currentLessonCount: 20,
        currentTerm: 2,
        paymentPending: false,
        pendingPaymentCount: 0,
      }],
      schedules: [{
        id: "summer-2026-2026-07-27-15:00",
        season: "summer-2026",
        date: "2026-07-27",
        slot: "15:00",
        studentIds: ["student-1"],
      }],
    });

    expect(html).toContain('<div class="student-name is-payment-pending">允涵</div>');
  });

  test("同一學生一天排兩堂會計為兩人次，且各堂顯示自己的點名堂數", () => {
    const html = renderRollCall({
      ...state,
      students: [{
        id: "student-1",
        name: "允涵",
        grade: 7,
        status: "active",
        currentLessonCount: 12,
        currentTerm: 1,
      }],
      schedules: [
        {
          id: "summer-2026-2026-07-27-15:00",
          season: "summer-2026",
          date: "2026-07-27",
          slot: "15:00",
          studentIds: ["student-1"],
        },
        {
          id: "summer-2026-2026-07-27-16:30",
          season: "summer-2026",
          date: "2026-07-27",
          slot: "16:30",
          studentIds: ["student-1"],
        },
      ],
      attendance: [
        {
          id: "2026-07-27__15%3A00__student-1",
          studentId: "student-1",
          dateKey: "2026-07-27",
          slot: "15:00",
          arrivalTime: "15:00",
          lessonNumber: 11,
        },
        {
          id: "2026-07-27__16%3A30__student-1",
          studentId: "student-1",
          dateKey: "2026-07-27",
          slot: "16:30",
          arrivalTime: "16:30",
          lessonNumber: 12,
        },
      ],
    });

    expect(html).toContain('<div class="stat-label">當日課程人次</div><div class="stat-value">2</div>');
    expect(html).toContain('<div class="student-subtitle">第 11 堂</div>');
    expect(html).toContain('<div class="student-subtitle">第 12 堂</div>');
    expect(html).toContain('<div class="roll-call-mobile-meta">11 / 15:00</div>');
    expect(html).toContain('<div class="roll-call-mobile-meta">12 / 16:30</div>');
  });

  test("上學期週六只顯示兩個上午時段", () => {
    selectAttendanceDate("2026-01-10");
    const html = renderRollCall({
      ...state,
      seasons: [{
        id: "fall-2025",
        name: "2025 上學期",
        startDate: "2025-09-01",
        endDate: "2026-01-31",
        active: true,
      }],
    });

    expect(html.match(/data-action="add-temporary-students"/g)).toHaveLength(2);
    expect(html).toContain(">09:00<");
    expect(html).toContain(">10:30<");
    expect(html).not.toContain(">15:00<");
  });

  test("寒暑假週六顯示未營業且沒有點名方塊", () => {
    selectAttendanceDate("2026-07-25");
    const html = renderRollCall(state);

    expect(html).toContain("今日未營業");
    expect(html).not.toContain('data-action="add-temporary-students"');
  });
});
