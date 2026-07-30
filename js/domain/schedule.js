import { isDateKey, isTimeValue } from "./models.js";
import {
  APP_CONFIG,
  SATURDAY_SCHEDULE_SLOTS,
  WEEKDAY_SCHEDULE_SLOTS,
} from "../config.js";

export function getSeasonKind(season) {
  const source = `${season?.id || ""} ${season?.name || ""}`.toLocaleLowerCase();
  if (source.includes("summer") || source.includes("暑假")) return "summer";
  if (source.includes("winter") || source.includes("寒假")) return "winter";
  if (source.includes("fall") || source.includes("上學期")) return "fall";
  if (source.includes("spring") || source.includes("下學期")) return "spring";
  return "unknown";
}

export function isBreakSeason(season) {
  return ["summer", "winter"].includes(getSeasonKind(season));
}

export function hasSaturdayMorning(season) {
  return ["fall", "spring"].includes(getSeasonKind(season));
}

export function getScheduleSlotsForWeekday(season, weekday) {
  const normalizedWeekday = Number(weekday);
  if (normalizedWeekday >= 1 && normalizedWeekday <= 5) {
    return WEEKDAY_SCHEDULE_SLOTS;
  }
  if (normalizedWeekday === 6 && hasSaturdayMorning(season)) {
    return SATURDAY_SCHEDULE_SLOTS;
  }
  return [];
}

function getZonedDateAndTime(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

export function isScheduleSlotUpcoming(dateKey, slot, now = new Date()) {
  if (!isDateKey(dateKey) || !isTimeValue(slot) || Number.isNaN(now?.getTime?.())) {
    return false;
  }
  const current = getZonedDateAndTime(now, APP_CONFIG.timezone);
  return dateKey > current.dateKey
    || (dateKey === current.dateKey && slot > current.time);
}

function encodeIdPart(value) {
  return encodeURIComponent(String(value));
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function shiftDateKey(dateKey, days) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return formatDateKey(date);
}

export function getSchedulePattern({ dateKey, slot }) {
  if (!isDateKey(dateKey)) throw new Error("排課日期格式不正確。");
  if (!isTimeValue(slot)) throw new Error("排課時間格式不正確。");
  return {
    sourceWeekday: parseDateKey(dateKey).getDay() || 7,
    sourceSlot: slot,
  };
}

export function makeSchedulePatternKey({ studentId, dateKey, slot }) {
  if (!studentId) throw new Error("排課學生不可為空白。");
  const pattern = getSchedulePattern({ dateKey, slot });
  return `${studentId}\u0000${pattern.sourceWeekday}\u0000${pattern.sourceSlot}`;
}

export function makeScheduleEntryId({ dateKey, slot, studentId }) {
  if (!isDateKey(dateKey)) throw new Error("排課日期格式不正確。");
  if (!isTimeValue(slot)) throw new Error("排課時間格式不正確。");
  if (!studentId) throw new Error("排課學生不可為空白。");
  return [dateKey, slot, studentId].map(encodeIdPart).join("__");
}

export function makeScheduleOverrideId({
  weekStart,
  seasonId,
  studentId,
  sourceWeekday,
  sourceSlot,
}) {
  if (!isDateKey(weekStart)) throw new Error("排課例外週次格式不正確。");
  if (!seasonId || !studentId || !Number.isInteger(sourceWeekday) || sourceWeekday < 1 || sourceWeekday > 7 || !isTimeValue(sourceSlot)) {
    throw new Error("排課例外缺少必要資料。");
  }
  return [weekStart, seasonId, studentId, sourceWeekday, sourceSlot]
    .map(encodeIdPart)
    .join("__");
}

export function buildCarryForwardEntries({
  previousEntries = [],
  currentEntries = [],
  overrides = [],
  seasonId,
}) {
  const existingEntryIds = new Set(currentEntries.map(makeScheduleEntryId));
  const overriddenPatterns = new Set(overrides.map((value) => (
    `${value.studentId}\u0000${value.sourceWeekday}\u0000${value.sourceSlot}`
  )));

  return previousEntries
    .filter((entry) => entry?.studentId && entry?.dateKey && entry?.slot && entry.temporary !== true)
    .map((entry) => ({
      studentId: entry.studentId,
      seasonId,
      dateKey: shiftDateKey(entry.dateKey, 7),
      slot: entry.slot,
      sourcePattern: makeSchedulePatternKey(entry),
    }))
    .filter((entry) => !existingEntryIds.has(makeScheduleEntryId(entry))
      && !overriddenPatterns.has(entry.sourcePattern))
    .map(({ sourcePattern, ...entry }) => entry);
}

export function groupScheduleEntries(entries = []) {
  const cells = new Map();
  entries.forEach((entry) => {
    if (!entry?.dateKey || !entry?.slot || !entry?.seasonId || !entry?.studentId) return;
    const key = `${entry.seasonId}\u0000${entry.dateKey}\u0000${entry.slot}`;
    if (!cells.has(key)) {
      cells.set(key, {
        id: `${entry.seasonId}-${entry.dateKey}-${entry.slot}`,
        season: entry.seasonId,
        date: entry.dateKey,
        slot: entry.slot,
        studentIds: [],
      });
    }
    const cell = cells.get(key);
    if (!cell.studentIds.includes(entry.studentId)) cell.studentIds.push(entry.studentId);
    if (entry.temporary === true) {
      if (!cell.temporaryStudentIds) cell.temporaryStudentIds = [];
      if (!cell.temporaryStudentIds.includes(entry.studentId)) {
        cell.temporaryStudentIds.push(entry.studentId);
      }
    }
  });
  return [...cells.values()].sort((a, b) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot));
}
