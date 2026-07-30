import { describe, expect, test } from "vitest";
import {
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

  test("目前期別已繳費後解除提醒", () => {
    const paidCycle = {
      id: "student-1__2",
      studentId: "student-1",
      term: 2,
      status: "paid",
    };
    expect(needsPaymentReminder(student, [paidCycle])).toBe(false);
    expect(getPaymentReminderItems([student], [paidCycle])).toEqual([]);
  });

  test("過去期別仍待繳時持續提醒", () => {
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
      isDerived: false,
    })]);
  });

  test("舊資料已超過第 20 堂但尚無提醒時會建立相容提醒項目", () => {
    expect(getPaymentReminderItems([student], [])).toEqual([{
      id: "student-1__2",
      studentId: "student-1",
      term: 2,
      reminderAt: null,
      isDerived: true,
    }]);
  });
});
