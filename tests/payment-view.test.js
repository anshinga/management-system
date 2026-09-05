import { describe, expect, test, vi } from "vitest";

vi.mock("../js/repositories/payments-repository.js", () => ({
  ensurePaymentReminders: vi.fn(() => Promise.resolve(0)),
  markBillingCyclePaid: vi.fn(() => Promise.resolve()),
}));

const { renderPayment } = await import("../js/views/payment.js");

describe("payment reminder view", () => {
  test("只顯示收費單提醒與已寄送勾選，不顯示金額及付款歷史", () => {
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
        id: "legacy-payment",
        studentId: "student-1",
        amount: 2000,
      }],
    });

    expect(html).toContain("收費單提醒");
    expect(html).toContain("目前第 20 堂");
    expect(html).toContain('data-action="mark-payment-paid"');
    expect(html).toContain("已寄送收費單");
    expect(html).not.toContain("已繳費");
    expect(html).not.toContain("付款歷史");
    expect(html).not.toContain("付款方式");
    expect(html).not.toContain("2000");
  });

  test("沿用 paid 狀態的已寄送或舊已繳費紀錄不再出現在提醒區", () => {
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

    expect(html).toContain("目前沒有待寄送的收費單");
    expect(html).not.toContain('data-action="mark-payment-paid"');
  });
});
