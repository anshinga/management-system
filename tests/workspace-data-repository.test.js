import { beforeEach, describe, expect, test, vi } from "vitest";

const snapshotHandlers = new Map();
const unsubscribeByName = new Map();

vi.mock("firebase/firestore", () => ({
  onSnapshot: (reference, options, next, error) => {
    snapshotHandlers.set(reference.name, { next, error, reference, options });
    const unsubscribe = vi.fn();
    unsubscribeByName.set(reference.name, unsubscribe);
    return unsubscribe;
  },
  query: (reference, ...constraints) => ({ ...reference, constraints }),
  where: (field, operator, value) => ({ field, operator, value }),
}));

vi.mock("../js/repositories/firestore-paths.js", () => ({
  COLLECTIONS: {
    students: "students",
    seasons: "seasons",
    scheduleEntries: "scheduleEntries",
    scheduleOverrides: "scheduleOverrides",
    attendance: "attendance",
    leaveRecords: "leaveRecords",
    billingCycles: "billingCycles",
    payments: "payments",
    bookingCampaigns: "bookingCampaigns",
    bookingInvitations: "bookingInvitations",
    bookingSubmissions: "bookingSubmissions",
    bookingSlotCounters: "bookingSlotCounters",
  },
  workspaceCollectionRef: (name) => ({ name }),
}));

const { subscribeToWorkspaceData } = await import(
  "../js/repositories/workspace-data-repository.js"
);

function emptySnapshot() {
  return {
    docs: [],
    docChanges: () => [],
    metadata: {
      fromCache: false,
      hasPendingWrites: false,
    },
  };
}

function resolveSnapshots(names) {
  names.forEach((name) => snapshotHandlers.get(name).next(emptySnapshot()));
}

describe("workspace data repository", () => {
  beforeEach(() => {
    snapshotHandlers.clear();
    unsubscribeByName.clear();
  });

  test("今日點名只訂閱基礎資料與所選日期範圍", () => {
    const states = [];
    const fatalError = vi.fn();
    subscribeToWorkspaceData(
      (state) => states.push(state),
      fatalError,
      {
        includeBooking: true,
        initialScope: {
          route: "roll-call",
          dateKey: "2026-08-13",
          weekStart: "2026-08-10",
        },
      },
    );

    expect([...snapshotHandlers.keys()].sort()).toEqual([
      "attendance",
      "billingCycles",
      "leaveRecords",
      "scheduleEntries",
      "scheduleOverrides",
      "seasons",
      "students",
    ]);
    expect(snapshotHandlers.has("payments")).toBe(false);
    expect(snapshotHandlers.has("bookingCampaigns")).toBe(false);
    expect(snapshotHandlers.get("attendance").reference.constraints).toEqual([{
      field: "dateKey",
      operator: "==",
      value: "2026-08-13",
    }]);

    resolveSnapshots([
      "students",
      "seasons",
      "billingCycles",
      "scheduleEntries",
      "scheduleOverrides",
      "attendance",
      "leaveRecords",
    ]);

    expect(fatalError).not.toHaveBeenCalled();
    expect(states.at(-1).sync.ready).toBe(true);
  });

  test("排課切換週次會解除舊範圍並建立新的日期查詢", () => {
    const states = [];
    const subscription = subscribeToWorkspaceData(
      (state) => states.push(state),
      vi.fn(),
      {
        initialScope: {
          route: "schedule",
          startDate: "2026-08-10",
          endDate: "2026-08-16",
          weekStart: "2026-08-10",
        },
      },
    );
    const oldScheduleUnsubscribe = unsubscribeByName.get("scheduleEntries");

    expect(snapshotHandlers.get("scheduleEntries").reference.constraints).toEqual([
      { field: "dateKey", operator: ">=", value: "2026-08-10" },
      { field: "dateKey", operator: "<=", value: "2026-08-16" },
    ]);

    expect(subscription.setScope({
      route: "schedule",
      startDate: "2026-08-17",
      endDate: "2026-08-23",
      weekStart: "2026-08-17",
    })).toBe(true);
    expect(oldScheduleUnsubscribe).toHaveBeenCalledOnce();
    expect(snapshotHandlers.get("scheduleEntries").reference.constraints).toEqual([
      { field: "dateKey", operator: ">=", value: "2026-08-17" },
      { field: "dateKey", operator: "<=", value: "2026-08-23" },
    ]);
    expect(states.at(-1).sync.ready).toBe(false);
  });

  test("切換頁面後會忽略舊監聽已排入佇列的回呼", () => {
    const states = [];
    const subscription = subscribeToWorkspaceData(
      (state) => states.push(state),
      vi.fn(),
      {
        initialScope: {
          route: "roll-call",
          dateKey: "2026-08-13",
          weekStart: "2026-08-10",
        },
      },
    );
    const oldAttendanceNext = snapshotHandlers.get("attendance").next;
    subscription.setScope({ route: "students" });
    oldAttendanceNext({
      ...emptySnapshot(),
      docs: [{ id: "old", data: () => ({ dateKey: "2026-08-13" }) }],
      docChanges: () => [{ type: "added" }],
    });

    expect(states.at(-1).attendance).toEqual([]);
  });

  test("數據分析頁只訂閱基礎資料，不會自動讀取歷史點名", () => {
    const states = [];
    subscribeToWorkspaceData(
      (state) => states.push(state),
      vi.fn(),
      { initialScope: { route: "analytics" } },
    );

    expect([...snapshotHandlers.keys()].sort()).toEqual([
      "billingCycles",
      "seasons",
      "students",
    ]);
    expect(snapshotHandlers.has("attendance")).toBe(false);
    resolveSnapshots(["students", "seasons", "billingCycles"]);
    expect(states.at(-1).sync.ready).toBe(true);
  });

  test("選課集合只在選課頁訂閱，權限錯誤不會阻斷核心資料", () => {
    const states = [];
    const fatalError = vi.fn();
    const subscription = subscribeToWorkspaceData(
      (state) => states.push(state),
      fatalError,
      { includeBooking: true, initialScope: { route: "students" } },
    );

    resolveSnapshots(["students", "seasons", "billingCycles"]);
    expect(states.at(-1).sync.ready).toBe(true);
    expect(snapshotHandlers.has("bookingCampaigns")).toBe(false);

    subscription.setScope({ route: "booking" });
    expect(snapshotHandlers.has("bookingSlotCounters")).toBe(false);
    [
      "bookingCampaigns",
      "bookingInvitations",
      "bookingSubmissions",
    ].forEach((name) => snapshotHandlers.get(name).error({
      code: "permission-denied",
    }));

    const state = states.at(-1);
    expect(fatalError).not.toHaveBeenCalled();
    expect(state.sync.ready).toBe(true);
    expect(state.booking).toEqual({
      available: false,
      errorCode: "permission-denied",
    });
    expect(state.students).toEqual([]);
    expect(state.bookingCampaigns).toEqual([]);
  });
});
