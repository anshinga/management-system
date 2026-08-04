import { getTodayDate } from "../store.js";
import {
  getArchivePeriods,
  getBiMonthPeriod,
  getStudentRecordItems,
} from "./records.js";

export const RECORDS_BACKUP_DATES_PER_ROW = 15;
export const RECORDS_BACKUP_TEMPLATE_ROWS = 66;

const FIRST_PAGE_ROWS = 21;
const CONTINUATION_PAGE_ROWS = 23;
const PERIOD_KEY_PATTERN = /^\d{4}-(?:01|03|05|07|09|11)$/;

function compareStudents(a, b) {
  return Number(a.grade || 0) - Number(b.grade || 0)
    || String(a.name || "").localeCompare(String(b.name || ""), "zh-Hant")
    || String(a.id || "").localeCompare(String(b.id || ""));
}

function formatShortDate(dateKey) {
  const [, month, day] = String(dateKey).split("-").map(Number);
  return `${month}/${day}`;
}

function formatRecordCellText(record) {
  const lessonNumber = Number(record.lessonNumber);
  const lessonLabel = Number.isFinite(lessonNumber) && lessonNumber > 0
    ? Math.trunc(lessonNumber)
    : "—";
  return `${formatShortDate(record.dateKey)}，${lessonLabel}`;
}

function chunkRecords(records) {
  if (!records.length) return [[]];
  return Array.from(
    { length: Math.ceil(records.length / RECORDS_BACKUP_DATES_PER_ROW) },
    (_, index) => records.slice(
      index * RECORDS_BACKUP_DATES_PER_ROW,
      (index + 1) * RECORDS_BACKUP_DATES_PER_ROW,
    ),
  );
}

function estimatePageCount(rowCount) {
  const renderedRows = Math.max(RECORDS_BACKUP_TEMPLATE_ROWS, rowCount);
  if (renderedRows <= FIRST_PAGE_ROWS) return 1;
  return 1 + Math.ceil((renderedRows - FIRST_PAGE_ROWS) / CONTINUATION_PAGE_ROWS);
}

function normalizePeriodKey(periodKey, todayDate) {
  const fallback = getBiMonthPeriod(todayDate).key;
  const normalized = String(periodKey || fallback);
  if (!PERIOD_KEY_PATTERN.test(normalized)) {
    throw new Error("課程紀錄備份的雙月期間格式不正確。");
  }
  return normalized;
}

export function getRecordsBackupPeriods(state, todayDate = getTodayDate()) {
  const current = getBiMonthPeriod(todayDate);
  const archives = getArchivePeriods(
    state.students || [],
    state.attendance || [],
    todayDate,
  );
  return [current, ...archives.filter(({ key }) => key !== current.key)];
}

export function formatRecordsBackupFileName(model) {
  return `${model.startDate}_${model.endDate}_課程紀錄備份.docx`;
}

export function buildRecordsBackupModel(
  state,
  periodKey,
  todayDate = getTodayDate(),
) {
  const normalizedPeriodKey = normalizePeriodKey(periodKey, todayDate);
  const period = getBiMonthPeriod(`${normalizedPeriodKey}-01`);
  const students = (state.students || [])
    .filter((student) => student.status === "active")
    .sort(compareStudents);
  let periodRecordCount = 0;
  let carryoverCount = 0;

  const rows = students.flatMap((student) => {
    const allRecords = getStudentRecordItems(student, state.attendance || []);
    const carryover = allRecords.filter((item) => item.dateKey < period.startDate).at(-1);
    const periodRecords = allRecords.filter((item) => (
      item.dateKey >= period.startDate && item.dateKey <= period.endDate
    ));
    const records = [
      ...(carryover ? [{ ...carryover, isCarryover: true }] : []),
      ...periodRecords,
    ];
    periodRecordCount += periodRecords.length;
    carryoverCount += Number(Boolean(carryover));

    return chunkRecords(records).map((chunk, continuationIndex) => ({
      studentId: student.id,
      studentName: student.name,
      grade: Number(student.grade || 0),
      continuation: continuationIndex > 0,
      continuationIndex,
      label: `${student.grade}.${student.name}${continuationIndex ? "(續)" : ""}`,
      records: chunk.map((record) => ({
        ...record,
        shortDate: formatShortDate(record.dateKey),
        cellText: formatRecordCellText(record),
      })),
    }));
  });

  const startMonth = Number(period.startDate.slice(5, 7));
  const endMonth = Number(period.endDate.slice(5, 7));
  const rocYear = Number(period.startDate.slice(0, 4)) - 1911;
  const continuationRowCount = rows.filter(({ continuation }) => continuation).length;

  return {
    periodKey: normalizedPeriodKey,
    periodLabel: period.label,
    startDate: period.startDate,
    endDate: period.endDate,
    startMonth,
    endMonth,
    rocYear,
    title: `${rocYear} 年 ${startMonth}–${endMonth} 月課程紀錄`,
    students,
    rows,
    studentCount: students.length,
    periodRecordCount,
    carryoverCount,
    continuationRowCount,
    pageCount: estimatePageCount(rows.length),
  };
}
