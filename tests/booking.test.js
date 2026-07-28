import { describe, expect, test } from "vitest";
import {
  formatBookingSlot,
  makeBookingSlotKey,
  normalizeBookingCampaignInput,
  validateBookingCampaignInput,
} from "../js/domain/booking.js";
import {
  expandSelectedSlots,
  generateRecurringDates,
  makeCounterId,
  validateCampaign,
} from "../functions/booking-domain.js";

function validCampaign(overrides = {}) {
  return {
    name: "2026 暑假選課",
    seasonId: "summer-2026",
    startDate: "2026-07-01",
    endDate: "2026-07-31",
    registrationDeadline: { toMillis: () => Date.UTC(2026, 5, 30) },
    minChoices: 1,
    maxChoices: 2,
    capacity: 10,
    availableSlots: ["1__15:00", "3__16:30"],
    excludedDates: [],
    ...overrides,
  };
}

describe("booking domain", () => {
  test("固定週時段使用穩定鍵值並顯示中文星期", () => {
    expect(makeBookingSlotKey(1, "15:00")).toBe("1__15:00");
    expect(formatBookingSlot("6__19:30")).toBe("週六 19:30");
    expect(makeCounterId("campaign-1", "3__16:30"))
      .toBe("campaign-1__3__16%3A30");
  });

  test("活動輸入會去除重複時段與停課日期", () => {
    const campaign = normalizeBookingCampaignInput({
      name: "  暑假選課  ",
      seasonId: "summer-2026",
      startDate: "2026-07-01",
      endDate: "2026-08-31",
      registrationDeadline: "2026-06-20T20:00",
      minChoices: "1",
      maxChoices: "2",
      availableSlots: ["3__16:30", "1__15:00", "3__16:30"],
      excludedDates: "2026-08-08, 2026-08-08\n2026-08-15",
    });
    expect(campaign.availableSlots).toEqual(["1__15:00", "3__16:30"]);
    expect(campaign.excludedDates).toEqual(["2026-08-08", "2026-08-15"]);
    expect(campaign.capacity).toBe(10);
    expect(validateBookingCampaignInput(campaign)).toBe(campaign);
  });

  test("固定週排課會略過停課日", () => {
    expect(generateRecurringDates(
      "2026-07-01",
      "2026-07-31",
      1,
      ["2026-07-13"],
    )).toEqual([
      "2026-07-06",
      "2026-07-20",
      "2026-07-27",
    ]);
  });

  test("一次選擇會展開成確定且不重複的排課文件", () => {
    const result = expandSelectedSlots(
      validCampaign(),
      "student-1",
      ["1__15:00", "3__16:30", "1__15:00"],
    );
    expect(result.selectedSlots).toEqual(["1__15:00", "3__16:30"]);
    expect(result.entries).toHaveLength(9);
    expect(result.entries[0]).toEqual({
      id: "2026-07-06__15%3A00__student-1",
      studentId: "student-1",
      seasonId: "summer-2026",
      dateKey: "2026-07-06",
      slot: "15:00",
      slotKey: "1__15:00",
    });
  });

  test("超過活動選擇數量或選到未開放時段會被拒絕", () => {
    expect(() => expandSelectedSlots(
      validCampaign({ minChoices: 2, maxChoices: 2 }),
      "student-1",
      ["1__15:00"],
    )).toThrow("請選擇 2 到 2 個時段");
    expect(() => expandSelectedSlots(
      validCampaign(),
      "student-1",
      ["2__15:00"],
    )).toThrow("未開放");
  });

  test("每時段容量不可由活動改成其他數字", () => {
    expect(() => validateCampaign(validCampaign({ capacity: 9 })))
      .toThrow("上限必須是 10 位學生");
  });
});
