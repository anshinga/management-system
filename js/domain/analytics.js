import { ALL_SCHEDULE_SLOTS } from "../config.js";
import { isDateKey, isTimeValue } from "./models.js";

export const ANALYTICS_DEFAULT_WEEKS = 8;
export const ANALYTICS_MAX_WEEKS = 13;
export const ANALYTICS_WEEK_OPTIONS = Object.freeze([4, 8, 13]);

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateKey(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateKey(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function addDays(dateKey, amount) {
  const date = parseDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatDateKey(date);
}

function getWeekStart(dateKey) {
  const date = parseDateKey(dateKey);
  const weekday = date.getUTCDay() || 7;
  return addDays(dateKey, 1 - weekday);
}

function formatShortDate(dateKey) {
  const [, month, day] = dateKey.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function rangeError(message, code) {
  const error = new Error(message);
  error.code = `analytics/${code}`;
  return error;
}

export function normalizeAnalyticsWeekCount(value) {
  const weekCount = Number(value);
  if (!Number.isInteger(weekCount) || weekCount < 1 || weekCount > ANALYTICS_MAX_WEEKS) {
    throw rangeError(`分析期間必須介於 1 至 ${ANALYTICS_MAX_WEEKS} 週。`, "invalid-week-count");
  }
  return weekCount;
}

export function validateAnalyticsDateRange(startDate, endDate) {
  if (!isDateKey(startDate) || !isDateKey(endDate) || startDate > endDate) {
    throw rangeError("分析日期範圍不正確。", "invalid-range");
  }
  const dayCount = Math.round((parseDateKey(endDate) - parseDateKey(startDate)) / DAY_MS) + 1;
  if (dayCount > ANALYTICS_MAX_WEEKS * 7) {
    throw rangeError(`單次分析最多只能讀取 ${ANALYTICS_MAX_WEEKS} 週。`, "range-too-large");
  }
  return { startDate, endDate, dayCount };
}

export function buildAnalyticsDateRange(
  weekCountInput = ANALYTICS_DEFAULT_WEEKS,
  todayDate,
) {
  if (!isDateKey(todayDate)) throw rangeError("今天日期格式不正確。", "invalid-today");
  const weekCount = normalizeAnalyticsWeekCount(weekCountInput);
  const currentWeekStart = getWeekStart(todayDate);
  const startDate = addDays(currentWeekStart, -7 * (weekCount - 1));
  const weeks = Array.from({ length: weekCount }, (_, index) => {
    const weekStart = addDays(startDate, index * 7);
    const weekEnd = addDays(weekStart, 6);
    return {
      startDate: weekStart,
      endDate: weekEnd,
      label: `${formatShortDate(weekStart)}–${formatShortDate(weekEnd)}`,
      shortLabel: formatShortDate(weekStart),
      isInProgress: weekStart === currentWeekStart,
    };
  });
  return {
    startDate,
    endDate: todayDate,
    weekCount,
    weeks,
  };
}

export function buildAttendanceAnalyticsModel({
  students = [],
  attendance = [],
}, range) {
  validateAnalyticsDateRange(range.startDate, range.endDate);
  const activeStudentIds = new Set(students
    .filter((student) => student.status === "active")
    .map((student) => student.id));
  const weekByStart = new Map(range.weeks.map((week) => [week.startDate, {
    ...week,
    total: 0,
    slotCounts: {},
  }]));
  const extraSlots = new Set();
  let total = 0;

  attendance.forEach((record) => {
    if (!activeStudentIds.has(record.studentId)
      || !isDateKey(record.dateKey)
      || record.dateKey < range.startDate
      || record.dateKey > range.endDate
      || !isTimeValue(record.slot)) return;
    const week = weekByStart.get(getWeekStart(record.dateKey));
    if (!week) return;
    if (!ALL_SCHEDULE_SLOTS.includes(record.slot)) extraSlots.add(record.slot);
    week.total += 1;
    week.slotCounts[record.slot] = Number(week.slotCounts[record.slot] || 0) + 1;
    total += 1;
  });

  const slots = [...ALL_SCHEDULE_SLOTS, ...[...extraSlots].sort()];
  const weeks = range.weeks.map(({ startDate }) => {
    const week = weekByStart.get(startDate);
    return {
      ...week,
      slotCounts: Object.fromEntries(slots.map((slot) => [
        slot,
        Number(week.slotCounts[slot] || 0),
      ])),
    };
  });
  const slotTotals = Object.fromEntries(slots.map((slot) => [
    slot,
    weeks.reduce((sum, week) => sum + week.slotCounts[slot], 0),
  ]));

  return {
    startDate: range.startDate,
    endDate: range.endDate,
    weeks,
    slots,
    slotTotals,
    total,
    maxWeeklyTotal: Math.max(0, ...weeks.map((week) => week.total)),
    recordsRead: attendance.length,
  };
}
