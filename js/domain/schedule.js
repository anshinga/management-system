import { isDateKey, isTimeValue } from "./models.js";

function encodeIdPart(value) {
  return encodeURIComponent(String(value));
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
  });
  return [...cells.values()].sort((a, b) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot));
}
