import { describe, expect, test } from "vitest";
import {
  isDateKey,
  isTimeValue,
  normalizePaymentInput,
  normalizeStudentInput,
} from "../js/domain/models.js";

describe("domain models", () => {
  test("學生輸入會轉成固定資料型態", () => {
    expect(normalizeStudentInput({
      name: "  王小明 ",
      grade: "5",
      lessonCount: "8",
      term: "2",
      status: "active",
    })).toEqual({
      name: "王小明",
      grade: 5,
      currentLessonCount: 8,
      currentTerm: 2,
      status: "active",
      pendingPaymentCount: 0,
      paymentPending: false,
    });
  });

  test("付款輸入會正規化", () => {
    expect(normalizePaymentInput({
      amount: "2000",
      method: "transfer",
      paidDate: "2026-07-27",
      note: "  七月繳費 ",
    })).toEqual({
      amount: 2000,
      method: "transfer",
      paidDate: "2026-07-27",
      note: "七月繳費",
    });
  });

  test("日期必須是真實存在的 YYYY-MM-DD", () => {
    expect(isDateKey("2026-07-27")).toBe(true);
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey("2026/07/27")).toBe(false);
  });

  test("時間必須是有效的 HH:mm", () => {
    expect(isTimeValue("00:00")).toBe(true);
    expect(isTimeValue("23:59")).toBe(true);
    expect(isTimeValue("24:00")).toBe(false);
    expect(isTimeValue("9:30")).toBe(false);
  });
});
