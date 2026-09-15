import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  documents: new Map(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => "server-timestamp"),
  transaction: {
    get: vi.fn(),
    set: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("firebase/firestore", () => ({
  runTransaction: mocks.runTransaction,
  serverTimestamp: mocks.serverTimestamp,
}));

vi.mock("../js/firebase/auth.js", () => ({
  auth: { currentUser: { uid: "owner-uid" } },
}));

vi.mock("../js/firebase/firestore.js", () => ({ db: { id: "database" } }));

vi.mock("../js/repositories/firestore-paths.js", () => ({
  COLLECTIONS: {
    billingCycles: "billingCycles",
    payments: "payments",
    students: "students",
  },
  workspaceDocumentRef: (collection, id) => `${collection}/${id}`,
}));

const {
  markBillingCyclePaid,
  markBillingNoticeSent,
} = await import("../js/repositories/payments-repository.js");

function snapshot(exists, data = {}) {
  return {
    data: () => data,
    exists: () => exists,
  };
}

beforeEach(() => {
  mocks.documents.clear();
  Object.values(mocks.transaction).forEach((mock) => mock.mockClear());
  mocks.runTransaction.mockImplementation((_database, callback) => callback(mocks.transaction));
  mocks.transaction.get.mockImplementation((reference) => Promise.resolve(
    mocks.documents.get(reference) || snapshot(false),
  ));
  mocks.documents.set("students/student-1", snapshot(true, {
    name: "測試學生",
    currentLessonCount: 20,
    currentTerm: 1,
    pendingPaymentCount: 1,
    paymentPending: true,
  }));
});

describe("payments repository", () => {
  test("開立收費單只移到待繳費，不解除學生紅字", async () => {
    mocks.documents.set("billingCycles/student-1__1", snapshot(true, {
      studentId: "student-1",
      term: 1,
      status: "pending",
    }));

    await markBillingNoticeSent("student-1__1", {
      studentId: "student-1",
      term: 1,
    });

    expect(mocks.transaction.update).toHaveBeenCalledTimes(1);
    expect(mocks.transaction.update).toHaveBeenCalledWith("billingCycles/student-1__1", {
      status: "awaiting_payment",
      noticeSentAt: "server-timestamp",
      updatedAt: "server-timestamp",
    });
  });

  test("確認繳費會建立不可變歷史並解除學生紅字", async () => {
    mocks.documents.set("billingCycles/student-1__1", snapshot(true, {
      studentId: "student-1",
      term: 1,
      status: "awaiting_payment",
    }));

    await markBillingCyclePaid("student-1__1", {
      studentId: "student-1",
      term: 1,
    });

    expect(mocks.transaction.set).toHaveBeenCalledWith("payments/student-1__1", {
      billingCycleId: "student-1__1",
      studentId: "student-1",
      studentName: "測試學生",
      term: 1,
      paidAt: "server-timestamp",
      confirmedBy: "owner-uid",
      createdAt: "server-timestamp",
    });
    expect(mocks.transaction.update).toHaveBeenCalledWith("billingCycles/student-1__1", {
      status: "paid",
      paymentId: "student-1__1",
      paidAt: "server-timestamp",
      updatedAt: "server-timestamp",
    });
    expect(mocks.transaction.update).toHaveBeenCalledWith("students/student-1", {
      pendingPaymentCount: 0,
      paymentPending: false,
      updatedAt: "server-timestamp",
    });
  });

  test("未開收費單時不能直接確認繳費", async () => {
    mocks.documents.set("billingCycles/student-1__1", snapshot(true, {
      studentId: "student-1",
      term: 1,
      status: "pending",
    }));

    await expect(markBillingCyclePaid("student-1__1", {
      studentId: "student-1",
      term: 1,
    })).rejects.toThrow("不是待繳費狀態");
    expect(mocks.transaction.set).not.toHaveBeenCalled();
  });
});
