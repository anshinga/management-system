import { describe, expect, test } from "vitest";
import {
  getAwaitingPaymentItems,
  getBillingNoticeItems,
  getPaymentReminderItems,
  needsPaymentReminder,
  PAYMENT_REMINDER_LESSON,
} from "../js/domain/payments.js";

const student = {
  id: "student-1",
  name: "測試學生",
  currentLessonCount: 20,
  currentTerm: 2,
  paymentPending: false,
  pendingPaymentCount: 0,
};

describe("payment reminders", () => {
  test("完成第 20 堂後開始提醒，第 19 堂不提醒", () => {
    expect(PAYMENT_REMINDER_LESSON).toBe(20);
    expect(needsPaymentReminder({ ...student, currentLessonCount: 19 }, [])).toBe(false);
    expect(needsPaymentReminder(student, [])).toBe(true);
  });

  test("目前期別已寄送或舊已繳費紀錄解除提醒", () => {
    const paidCycle = {
      id: "student-1__2",
      studentId: "student-1",
      term: 2,
      status: "paid",
    };
    expect(needsPaymentReminder(student, [paidCycle])).toBe(false);
    expect(getPaymentReminderItems([student], [paidCycle])).toEqual([]);
  });

  test("過去期別仍待寄收費單時持續提醒", () => {
    const pendingCycle = {
      id: "student-1__1",
      studentId: "student-1",
      term: 1,
      status: "pending",
    };
    expect(needsPaymentReminder({ ...student, currentLessonCount: 3 }, [pendingCycle])).toBe(true);
    expect(getPaymentReminderItems(
      [{ ...student, currentLessonCount: 3 }],
      [pendingCycle],
    )).toEqual([expect.objectContaining({
      id: "student-1__1",
      term: 1,
      status: "pending",
      isDerived: false,
    })]);
  });

  test("開立收費單後仍維持提醒，並移到待繳費區", () => {
    const awaitingCycle = {
      id: "student-1__2",
      studentId: "student-1",
      term: 2,
      status: "awaiting_payment",
      noticeSentAt: new Date("2026-09-15T04:00:00Z"),
    };

    expect(needsPaymentReminder(student, [awaitingCycle])).toBe(true);
    expect(getBillingNoticeItems([student], [awaitingCycle])).toEqual([]);
    expect(getAwaitingPaymentItems([student], [awaitingCycle])).toEqual([
      expect.objectContaining({
        id: "student-1__2",
        status: "awaiting_payment",
      }),
    ]);
  });

  test("舊資料已超過第 20 堂但尚無提醒時會建立相容提醒項目", () => {
    expect(getPaymentReminderItems([student], [])).toEqual([{
      id: "student-1__2",
      studentId: "student-1",
      term: 2,
      status: "pending",
      reminderAt: null,
      noticeSentAt: null,
      isDerived: true,
    }]);
  });
});
