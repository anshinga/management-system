const SCHEDULE_SLOTS = Object.freeze(["09:00", "10:30", "15:00", "16:30", "18:00", "19:30"]);
const WEEKDAYS = Object.freeze([1, 2, 3, 4, 5, 6]);

function pad(value) {
  return String(value).padStart(2, "0");
}

export function parseDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("日期格式不正確。");
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day) {
    throw new Error("日期不存在。");
  }
  return date;
}

export function formatDateKey(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function parseSlotKey(value) {
  const [weekdayValue, slot] = String(value || "").split("__");
  const weekday = Number(weekdayValue);
  if (!WEEKDAYS.includes(weekday) || !SCHEDULE_SLOTS.includes(slot)) {
    throw new Error("固定週時段格式不正確。");
  }
  return { weekday, slot };
}

export function generateRecurringDates(startDate, endDate, weekday, excludedDates = []) {
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  if (start > end || !WEEKDAYS.includes(Number(weekday))) throw new Error("上課日期區間不正確。");
  const excluded = new Set(excludedDates);
  const dates = [];
  for (const current = new Date(start); current <= end; current.setUTCDate(current.getUTCDate() + 1)) {
    const currentWeekday = current.getUTCDay() || 7;
    const dateKey = formatDateKey(current);
    if (currentWeekday === Number(weekday) && !excluded.has(dateKey)) dates.push(dateKey);
  }
  return dates;
}

export function makeScheduleEntryId({ dateKey, slot, studentId }) {
  if (!studentId || studentId.includes("/")) throw new Error("學生 ID 不正確。");
  parseDateKey(dateKey);
  if (!SCHEDULE_SLOTS.includes(slot)) throw new Error("排課時間不正確。");
  return `${dateKey}__${slot.replace(":", "%3A")}__${studentId}`;
}

export function makeCounterId(campaignId, slotKey) {
  const { weekday, slot } = parseSlotKey(slotKey);
  return `${campaignId}__${weekday}__${slot.replace(":", "%3A")}`;
}

export function validateCampaign(campaign) {
  if (!campaign?.name || !campaign?.seasonId) throw new Error("活動資料不完整。");
  const start = parseDateKey(campaign.startDate);
  const end = parseDateKey(campaign.endDate);
  const durationDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (durationDays < 1 || durationDays > 220) throw new Error("單一活動日期區間不可超過 220 天。");
  if (!Number.isInteger(campaign.minChoices) || campaign.minChoices < 1
    || !Number.isInteger(campaign.maxChoices)
    || campaign.maxChoices < campaign.minChoices
    || campaign.maxChoices > 12) {
    throw new Error("活動選擇數量設定不正確。");
  }
  if (campaign.capacity !== 10) throw new Error("每個時段上限必須是 10 位學生。");
  if (!Array.isArray(campaign.availableSlots)
    || campaign.availableSlots.length < campaign.maxChoices
    || campaign.availableSlots.length > 24) {
    throw new Error("活動可選時段設定不正確。");
  }
  campaign.availableSlots.forEach(parseSlotKey);
  if (!Array.isArray(campaign.excludedDates) || campaign.excludedDates.length > 100) {
    throw new Error("停課日期設定不正確。");
  }
  campaign.excludedDates.forEach((dateKey) => {
    parseDateKey(dateKey);
    if (dateKey < campaign.startDate || dateKey > campaign.endDate) {
      throw new Error("停課日期不在活動區間內。");
    }
  });
  if (!campaign.registrationDeadline?.toMillis) throw new Error("活動截止時間不正確。");
  return campaign;
}

export function expandSelectedSlots(campaign, studentId, selectedSlots) {
  const uniqueSlots = [...new Set((selectedSlots || []).map(String))];
  if (uniqueSlots.length < campaign.minChoices || uniqueSlots.length > campaign.maxChoices) {
    throw new Error(`請選擇 ${campaign.minChoices} 到 ${campaign.maxChoices} 個時段。`);
  }
  if (uniqueSlots.some((slotKey) => !campaign.availableSlots.includes(slotKey))) {
    throw new Error("選擇中包含未開放的時段。");
  }
  const entries = uniqueSlots.flatMap((slotKey) => {
    const { weekday, slot } = parseSlotKey(slotKey);
    return generateRecurringDates(
      campaign.startDate,
      campaign.endDate,
      weekday,
      campaign.excludedDates,
    ).map((dateKey) => ({
      id: makeScheduleEntryId({ dateKey, slot, studentId }),
      studentId,
      seasonId: campaign.seasonId,
      dateKey,
      slot,
      slotKey,
    }));
  });
  if (!entries.length) throw new Error("所選時段在活動日期內沒有可排課日期。");
  if (entries.length > 420) throw new Error("這次選擇產生的排課筆數過多，請縮短日期區間或降低最多選擇數量。");
  return { selectedSlots: uniqueSlots, entries };
}
