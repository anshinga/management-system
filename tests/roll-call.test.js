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

function selectAttendanceDate(dateKey) {
  localStorage.setItem("mpm-selected-attendance-date", dateKey);
}

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
