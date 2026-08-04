import {
  addDays,
  formatDate,
  getWeekDates,
  getWeekStart,
  parseDate,
} from "../store.js";
import {
  buildCarryForwardEntries,
  getScheduleSlotsForWeekday,
  groupScheduleEntries,
} from "./schedule.js";

const WEEKDAY_NAMES = ["一", "二", "三", "四", "五", "六"];

export const BACKUP_TEMPLATE_LAYOUT = Object.freeze({
  weekdays: Object.freeze({
    "15:00": Object.freeze({ startRow: 1, rowCount: 4, pairsPerRow: 2, capacity: 8 }),
    "16:30": Object.freeze({ startRow: 5, rowCount: 4, pairsPerRow: 2, capacity: 8 }),
    "18:00": Object.freeze({ startRow: 9, rowCount: 5, pairsPerRow: 2, capacity: 10 }),
    "19:30": Object.freeze({ startRow: 14, rowCount: 5, pairsPerRow: 2, capacity: 10 }),
  }),
  saturday: Object.freeze({
    "09:00": Object.freeze({ startRow: 1, rowCount: 8, pairsPerRow: 1, capacity: 8 }),
    "10:30": Object.freeze({ startRow: 9, rowCount: 10, pairsPerRow: 1, capacity: 10 }),
  }),
});

function cellKey(dateKey, slot) {
  return `${dateKey}\u0000${slot}`;
}

function isSeasonDate(season, dateKey) {
  return Boolean(season?.startDate && season?.endDate
    && dateKey >= season.startDate
    && dateKey <= season.endDate);
}

function entriesForWeek(entries, seasonId, weekStart) {
  const weekEnd = formatDate(addDays(parseDate(weekStart), 6));
  return entries.filter((entry) => entry?.seasonId === seasonId
    && entry?.dateKey >= weekStart
    && entry?.dateKey <= weekEnd);
}

function flattenGroupedEntries(cells) {
  return cells.flatMap((schedule) => schedule.studentIds.map((studentId) => ({
    studentId,
    seasonId: schedule.season,
    dateKey: schedule.date,
    slot: schedule.slot,
    ...(schedule.temporaryStudentIds?.includes(studentId) ? { temporary: true } : {}),
  })));
}

function deriveSeasonWeekEntries(state, season, targetWeekStart) {
  const seasonWeekStart = formatDate(getWeekStart(parseDate(season.startDate)));
  if (targetWeekStart < seasonWeekStart) return [];

  let previousEntries = [];
  let cursor = parseDate(seasonWeekStart);
  const targetDate = parseDate(targetWeekStart);

  while (cursor <= targetDate) {
    const currentWeekStart = formatDate(cursor);
    const currentEntries = entriesForWeek(
      state.scheduleEntries || [],
      season.id,
      currentWeekStart,
    ).filter((entry) => isSeasonDate(season, entry.dateKey));
    const currentOverrides = (state.scheduleOverrides || []).filter((override) => (
      override?.seasonId === season.id && override?.weekStart === currentWeekStart
    ));
    const carriedEntries = buildCarryForwardEntries({
      previousEntries,
      currentEntries,
      overrides: currentOverrides,
      seasonId: season.id,
    }).filter((entry) => isSeasonDate(season, entry.dateKey));

    previousEntries = flattenGroupedEntries(groupScheduleEntries(
      [...currentEntries, ...carriedEntries],
      currentOverrides,
    ));
    cursor = addDays(cursor, 7);
  }

  return previousEntries;
}

function compareStudents(a, b) {
  return Number(a.grade || 0) - Number(b.grade || 0)
    || String(a.name || "").localeCompare(String(b.name || ""), "zh-Hant")
    || String(a.id || "").localeCompare(String(b.id || ""));
}

function capacityFor(dayIndex, slot) {
  const layout = dayIndex === 5
    ? BACKUP_TEMPLATE_LAYOUT.saturday[slot]
    : BACKUP_TEMPLATE_LAYOUT.weekdays[slot];
  return layout?.capacity || 1;
}

function allocateDayPages(day) {
  if (!day.slots.length) return { pages: [{}], reassignedOccurrenceCount: 0 };
  const remainingBySlot = day.slots.map(({ students }) => [...students]);
  const pages = [];
  let reassignedOccurrenceCount = 0;

  while (remainingBySlot.some((students) => students.length) || !pages.length) {
    const pageSlots = day.slots.map(({ slot }, slotIndex) => (
      remainingBySlot[slotIndex].splice(0, capacityFor(day.weekdayIndex, slot))
    ));

    remainingBySlot.forEach((overflow, sourceIndex) => {
      for (let targetIndex = sourceIndex + 1; overflow.length && targetIndex < day.slots.length; targetIndex += 1) {
        const targetCapacity = capacityFor(day.weekdayIndex, day.slots[targetIndex].slot);
        const available = Math.max(0, targetCapacity - pageSlots[targetIndex].length);
        if (!available) continue;
        const moved = overflow.splice(0, available);
        pageSlots[targetIndex].push(...moved);
        reassignedOccurrenceCount += moved.length;
      }
    });

    pages.push(Object.fromEntries(day.slots.map(({ slot }, slotIndex) => (
      [slot, pageSlots[slotIndex]]
    ))));
  }

  return { pages, reassignedOccurrenceCount };
}

export function getDefaultBackupWeekStart(now = new Date()) {
  return addDays(getWeekStart(now), 7);
}

export function formatBackupFileName(model) {
  return `${model.weekStart}_${model.weekEnd}_點名備份.docx`;
}

export function buildBackupExportModel(state, weekStartInput = getDefaultBackupWeekStart()) {
  const weekStartDate = getWeekStart(
    typeof weekStartInput === "string" ? parseDate(weekStartInput) : weekStartInput,
  );
  const weekDates = getWeekDates(weekStartDate);
  const weekStart = formatDate(weekDates[0]);
  const weekEnd = formatDate(weekDates[5]);
  const overlappingSeasons = (state.seasons || []).filter((season) => (
    season?.startDate <= weekEnd && season?.endDate >= weekStart
  ));
  const derivedEntries = overlappingSeasons.flatMap((season) => (
    deriveSeasonWeekEntries(state, season, weekStart)
  ));
  const activeStudents = new Map((state.students || [])
    .filter((student) => student.status === "active")
    .map((student) => [student.id, student]));
  const entriesByCell = new Map();

  derivedEntries.forEach((entry) => {
    const student = activeStudents.get(entry.studentId);
    if (!student || entry.dateKey < weekStart || entry.dateKey > weekEnd) return;
    const season = overlappingSeasons.find((item) => (
      item.id === entry.seasonId && isSeasonDate(item, entry.dateKey)
    ));
    if (!season) return;
    const weekday = parseDate(entry.dateKey).getDay() || 7;
    if (!getScheduleSlotsForWeekday(season, weekday).includes(entry.slot)) return;
    const key = cellKey(entry.dateKey, entry.slot);
    if (!entriesByCell.has(key)) entriesByCell.set(key, new Map());
    entriesByCell.get(key).set(student.id, {
      id: student.id,
      name: student.name,
      grade: student.grade,
      temporary: entry.temporary === true,
    });
  });

  const days = weekDates.map((date, weekdayIndex) => {
    const dateKey = formatDate(date);
    const season = overlappingSeasons.find((item) => isSeasonDate(item, dateKey));
    const slots = getScheduleSlotsForWeekday(season, weekdayIndex + 1).map((slot) => ({
      slot,
      students: [...(entriesByCell.get(cellKey(dateKey, slot))?.values() || [])]
        .sort(compareStudents),
    }));
    return {
      dateKey,
      weekdayIndex,
      weekday: WEEKDAY_NAMES[weekdayIndex],
      label: `${date.getMonth() + 1}/${date.getDate()} 週${WEEKDAY_NAMES[weekdayIndex]}`,
      header: `${date.getMonth() + 1}/${date.getDate()}${WEEKDAY_NAMES[weekdayIndex]}`,
      seasonId: season?.id || "",
      seasonName: season?.name || "",
      slots,
    };
  });
  const totalOccurrences = days.reduce((total, day) => (
    total + day.slots.reduce((dayTotal, slot) => dayTotal + slot.students.length, 0)
  ), 0);
  const uniqueStudentIds = new Set(days.flatMap((day) => (
    day.slots.flatMap((slot) => slot.students.map((student) => student.id))
  )));
  const allocatedDays = days.map((day) => allocateDayPages(day));
  const pageCount = Math.max(1, ...allocatedDays.map(({ pages }) => pages.length));
  const reassignedOccurrenceCount = allocatedDays.reduce((total, allocation) => (
    total + allocation.reassignedOccurrenceCount
  ), 0);
  const year = weekStartDate.getFullYear();
  const month = weekStartDate.getMonth() + 1;
  const pages = Array.from({ length: pageCount }, (_, pageIndex) => ({
    pageNumber: pageIndex + 1,
    title: `${year} MPM ${month}月上課時間表${pageIndex ? `（續頁 ${pageIndex + 1}）` : ""}`,
    cells: Object.fromEntries(days.flatMap((day, dayIndex) => day.slots.map(({ slot }) => (
      [cellKey(day.dateKey, slot), allocatedDays[dayIndex].pages[pageIndex]?.[slot] || []]
    )))),
  }));

  return {
    weekStart,
    weekEnd,
    year,
    month,
    label: `${weekDates[0].getMonth() + 1}/${weekDates[0].getDate()} 週一 — ${weekDates[5].getMonth() + 1}/${weekDates[5].getDate()} 週六`,
    title: `${year} MPM ${month}月上課時間表`,
    days,
    pages,
    pageCount,
    reassignedOccurrenceCount,
    totalOccurrences,
    uniqueStudentCount: uniqueStudentIds.size,
  };
}

export function getBackupTemplatePlacements(model, pageIndex = 0) {
  const page = model.pages[pageIndex];
  if (!page) return [];
  return model.days.flatMap((day) => day.slots.flatMap(({ slot }) => {
    const students = page.cells[cellKey(day.dateKey, slot)] || [];
    const layout = day.weekdayIndex === 5
      ? BACKUP_TEMPLATE_LAYOUT.saturday[slot]
      : BACKUP_TEMPLATE_LAYOUT.weekdays[slot];
    if (!layout) return [];
    const baseColumn = day.weekdayIndex === 5 ? 21 : 1 + (day.weekdayIndex * 4);
    return students.map((student, index) => ({
      row: layout.startRow + Math.floor(index / layout.pairsPerRow),
      column: baseColumn + ((index % layout.pairsPerRow) * 2),
      dateKey: day.dateKey,
      slot,
      student,
    }));
  }));
}

export function getBackupPageCellStudents(model, pageIndex, dateKey, slot) {
  return model.pages[pageIndex]?.cells[cellKey(dateKey, slot)] || [];
}
