import { SCHEDULE_SLOTS } from "../config.js";
import { isDateKey, isTimeValue, normalizeText } from "./models.js";

export const BOOKING_WEEKDAYS = Object.freeze([
  { value: 1, label: "週一" },
  { value: 2, label: "週二" },
  { value: 3, label: "週三" },
  { value: 4, label: "週四" },
  { value: 5, label: "週五" },
  { value: 6, label: "週六" },
]);

export const BOOKING_CAMPAIGN_STATUSES = Object.freeze(["draft", "open", "closed"]);
export const BOOKING_CAPACITY = 10;

export function makeBookingSlotKey(weekday, slot) {
  const normalizedWeekday = Number(weekday);
  if (!BOOKING_WEEKDAYS.some((item) => item.value === normalizedWeekday)) {
    throw new Error("選課星期必須是週一到週六。");
  }
  if (!SCHEDULE_SLOTS.includes(slot) || !isTimeValue(slot)) {
    throw new Error("選課時段不正確。");
  }
  return `${normalizedWeekday}__${slot}`;
}

export function parseBookingSlotKey(value) {
  const [weekdayValue, slot] = String(value || "").split("__");
  const weekday = Number(weekdayValue);
  if (!BOOKING_WEEKDAYS.some((item) => item.value === weekday) || !SCHEDULE_SLOTS.includes(slot)) {
    throw new Error("選課時段格式不正確。");
  }
  return { weekday, slot };
}

export function formatBookingSlot(value) {
  const { weekday, slot } = parseBookingSlotKey(value);
  const weekdayLabel = BOOKING_WEEKDAYS.find((item) => item.value === weekday)?.label || "";
  return `${weekdayLabel} ${slot}`;
}

export function normalizeExcludedDates(value) {
  const values = Array.isArray(value)
    ? value
    : String(value || "").split(/[\s,，]+/);
  return [...new Set(values.map(normalizeText).filter(Boolean))].sort();
}

export function normalizeBookingCampaignInput(input = {}) {
  const availableSlots = [...new Set((input.availableSlots || []).map(String))].sort();
  const excludedDates = normalizeExcludedDates(input.excludedDates);
  return {
    name: normalizeText(input.name),
    seasonId: normalizeText(input.seasonId),
    startDate: normalizeText(input.startDate),
    endDate: normalizeText(input.endDate),
    registrationDeadline: normalizeText(input.registrationDeadline),
    minChoices: Number(input.minChoices),
    maxChoices: Number(input.maxChoices),
    capacity: BOOKING_CAPACITY,
    availableSlots,
    excludedDates,
  };
}

export function validateBookingCampaignInput(campaign) {
  if (!campaign.name || campaign.name.length > 100) throw new Error("請輸入 1 到 100 字的活動名稱。");
  if (!campaign.seasonId) throw new Error("請選擇對應時期。");
  if (!isDateKey(campaign.startDate) || !isDateKey(campaign.endDate) || campaign.startDate > campaign.endDate) {
    throw new Error("活動上課日期區間不正確。");
  }
  const deadline = new Date(campaign.registrationDeadline);
  if (!campaign.registrationDeadline || Number.isNaN(deadline.getTime())) {
    throw new Error("請設定有效的家長填寫截止時間。");
  }
  if (!Number.isInteger(campaign.minChoices) || campaign.minChoices < 1) {
    throw new Error("最少選擇數量必須大於 0。");
  }
  if (!Number.isInteger(campaign.maxChoices) || campaign.maxChoices < campaign.minChoices) {
    throw new Error("最多選擇數量不可小於最少選擇數量。");
  }
  if (campaign.maxChoices > 12) throw new Error("單次活動最多可設定 12 個固定週時段。");
  if (campaign.maxChoices > campaign.availableSlots.length) {
    throw new Error("最多選擇數量不可超過可選時段數量。");
  }
  if (!campaign.availableSlots.length || campaign.availableSlots.length > 24) {
    throw new Error("請選擇至少一個、最多 24 個上課時段。");
  }
  campaign.availableSlots.forEach(parseBookingSlotKey);
  const startDate = new Date(`${campaign.startDate}T00:00:00`);
  const endDate = new Date(`${campaign.endDate}T00:00:00`);
  const durationDays = Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
  if (durationDays > 220) throw new Error("單一活動日期區間不可超過 220 天。");
  if (campaign.excludedDates.length > 100
    || campaign.excludedDates.some((date) => !isDateKey(date)
      || date < campaign.startDate
      || date > campaign.endDate)) {
    throw new Error("停課日期必須位於活動上課日期區間內，最多 100 天。");
  }
  return campaign;
}

export function getBookingCampaignStatusLabel(status) {
  return {
    draft: "草稿",
    open: "開放中",
    closed: "已截止",
  }[status] || "未知狀態";
}
