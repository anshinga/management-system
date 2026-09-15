import { describe, expect, test, vi } from "vitest";

vi.mock("../js/repositories/payments-repository.js", () => ({
  ensurePaymentReminders: vi.fn(() => Promise.resolve(0)),
  markBillingCyclePaid: vi.fn(() => Promise.resolve()),
  markBillingNoticeSent: vi.fn(() => Promise.resolve()),
}));

const { renderPayment } = await import("../js/views/payment.js");

describe("payment reminder view", () => {
  test("顯示待開單、待繳費與繳費紀錄三區", () => {
    const html = renderPayment({
      students: [{
        id: "student-1",
        name: "允涵",
        grade: 7,
        currentLessonCount: 20,
        currentTerm: 2,
      }],
      billingCycles: [],
      payments: [{
        id: "student-1__1",
        studentId: "student-1",
        studentName: "允涵",
        term: 1,
        paidAt: new Date("2026-09-15T04:34:00Z"),
      }],
    });

    expect(html).toContain("收費單與繳費");
    expect(html).toContain("待開收費單");
    expect(html).toContain("待繳費");
    expect(html).toContain("繳費紀錄");
    expect(html).toContain("目前第 20 堂");
    expect(html).toContain('data-action="mark-notice-sent"');
    expect(html).toContain("已開收費單");
    expect(html).toContain("2026/09/15 12:34");
  });

  test("開單後移到待繳費區，仍可勾選已繳費", () => {
    const html = renderPayment({
      students: [{
        id: "student-1",
        name: "允涵",
        grade: 7,
        currentLessonCount: 22,
        currentTerm: 2,
      }],
      billingCycles: [{
        id: "student-1__2",
        studentId: "student-1",
        term: 2,
        status: "awaiting_payment",
      }],
      payments: [],
    });

    expect(html).toContain("目前沒有待開立的收費單");
    expect(html).toContain("收費單已開，等待繳費");
    expect(html).toContain('data-action="mark-payment-paid"');
    expect(html).not.toContain('data-action="mark-notice-sent"');
  });

  test("舊 paid 週期維持結案，不會被當成新繳費歷史", () => {
    const html = renderPayment({
      students: [{
        id: "student-1",
        name: "允涵",
        grade: 7,
        currentLessonCount: 22,
        currentTerm: 2,
      }],
      billingCycles: [{
        id: "student-1__2",
        studentId: "student-1",
        term: 2,
        status: "paid",
      }],
      payments: [],
    });

    expect(html).toContain("目前沒有待開立的收費單");
    expect(html).toContain("目前沒有待繳費項目");
    expect(html).toContain("目前沒有繳費紀錄");
  });

  test("非 owner 只能查看狀態，不會顯示操作方框", () => {
    const html = renderPayment({
      students: [{
        id: "student-1",
        name: "允涵",
        grade: 7,
        currentLessonCount: 20,
        currentTerm: 2,
      }],
      billingCycles: [],
      payments: [],
    }, { canManage: false });

    expect(html).toContain("已開收費單");
    expect(html).not.toContain('data-action="mark-notice-sent"');
    expect(html).not.toContain('data-action="mark-payment-paid"');
  });
});
