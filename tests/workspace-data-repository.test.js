import { describe, expect, test, vi } from "vitest";

const snapshotHandlers = new Map();

vi.mock("firebase/firestore", () => ({
  onSnapshot: (reference, options, next, error) => {
    snapshotHandlers.set(reference.name, { next, error });
    return vi.fn();
  },
}));

vi.mock("../js/repositories/firestore-paths.js", () => ({
  COLLECTIONS: {
    students: "students",
    seasons: "seasons",
    scheduleEntries: "scheduleEntries",
    scheduleOverrides: "scheduleOverrides",
    attendance: "attendance",
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

describe("workspace data repository", () => {
  test("選課集合權限尚未部署時不會中斷原本系統載入", () => {
    snapshotHandlers.clear();
    const states = [];
    const fatalError = vi.fn();
    subscribeToWorkspaceData(
      (state) => states.push(state),
      fatalError,
      { includeBooking: true },
    );

    [
      "students",
      "seasons",
      "scheduleEntries",
      "scheduleOverrides",
      "attendance",
      "billingCycles",
      "payments",
    ].forEach((name) => snapshotHandlers.get(name).next(emptySnapshot()));

    [
      "bookingCampaigns",
      "bookingInvitations",
      "bookingSubmissions",
      "bookingSlotCounters",
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
