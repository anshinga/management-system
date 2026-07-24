const STORAGE_KEY = "mpm-attendance-prototype-v1";
const ATTENDANCE_DATE_KEY = "mpm-selected-attendance-date";

const seed = {
  lastGradePromotionYear: 2025,
  scheduleOverrides: [],
  seasons: [
    { id: "summer-2026", name: "2026 暑假", startDate: "2026-07-01", endDate: "2026-08-31", active: true },
    { id: "fall-2026", name: "2026 上學期", startDate: "2026-09-01", endDate: "2027-01-31", active: false },
  ],
  students: [
    { id: "s1", name: "陳品妤", grade: 5, lessonCount: 8, term: 2, status: "active", paymentPending: false },
    { id: "s2", name: "林冠廷", grade: 6, lessonCount: 23, term: 1, status: "active", paymentPending: false },
    { id: "s3", name: "王思涵", grade: 3, lessonCount: 24, term: 3, status: "active", paymentPending: true },
    { id: "s4", name: "張予安", grade: 8, lessonCount: 14, term: 1, status: "active", paymentPending: false },
    { id: "s5", name: "黃子宸", grade: 4, lessonCount: 4, term: 2, status: "paused", paymentPending: false },
    { id: "s6", name: "吳語晴", grade: 7, lessonCount: 21, term: 2, status: "active", paymentPending: false },
    { id: "s7", name: "李承恩", grade: 2, lessonCount: 10, term: 1, status: "active", paymentPending: false },
    { id: "s8", name: "周芷瑜", grade: 9, lessonCount: 19, term: 1, status: "active", paymentPending: false },
  ],
  schedules: [
    { id: "a1", season: "summer-2026", weekday: 1, slot: "15:00", studentIds: ["s7"] },
    { id: "a2", season: "summer-2026", weekday: 1, slot: "16:30", studentIds: ["s1", "s4"] },
    { id: "a3", season: "summer-2026", weekday: 2, slot: "18:00", studentIds: ["s2", "s6"] },
    { id: "a4", season: "summer-2026", weekday: 3, slot: "19:00", studentIds: ["s3", "s8"] },
    { id: "a5", season: "summer-2026", weekday: 4, slot: "16:30", studentIds: ["s1", "s5"] },
    { id: "a6", season: "summer-2026", weekday: 4, slot: "19:30", studentIds: ["s2", "s4", "s6"] },
    { id: "a7", season: "summer-2026", weekday: 5, slot: "18:00", studentIds: ["s7", "s8"] },
    { id: "a8", season: "summer-2026", weekday: 6, slot: "15:00", studentIds: ["s3", "s5"] },
  ],
  attendance: [
    { id: "att-1", studentId: "s1", date: "2026-07-20", slot: "16:30", arrivalTime: "16:28", lessonNumber: 8, term: 2 },
    { id: "att-2", studentId: "s2", date: "2026-07-21", slot: "18:00", arrivalTime: "18:03", lessonNumber: 23, term: 1 },
    { id: "att-3", studentId: "s4", date: "2026-07-20", slot: "16:30", arrivalTime: "16:35", lessonNumber: 14, term: 1 },
  ],
};

function clone(value) { return JSON.parse(JSON.stringify(value)); }
const DEFAULT_SEASON = "summer-2026";

function getGradePromotionYear(date = new Date()) {
  const promotionDate = new Date(date.getFullYear(), 6, 1);
  return date >= promotionDate ? date.getFullYear() : date.getFullYear() - 1;
}

function normalizeGradePromotion(state, date = new Date()) {
  const promotionYear = getGradePromotionYear(date);
  const hasMarker = Number.isInteger(state.lastGradePromotionYear);
  const currentYearAfterPromotionDate = date >= new Date(date.getFullYear(), 6, 1);
  const lastGradePromotionYear = hasMarker
    ? state.lastGradePromotionYear
    : currentYearAfterPromotionDate ? promotionYear - 1 : promotionYear;

  if (!hasMarker) state.lastGradePromotionYear = lastGradePromotionYear;
  if (lastGradePromotionYear >= promotionYear) return !hasMarker;

  const yearsToPromote = promotionYear - lastGradePromotionYear;
  state.students.forEach((student) => {
    const grade = Number(student.grade);
    if (Number.isFinite(grade)) student.grade = grade + yearsToPromote;
  });
  state.lastGradePromotionYear = promotionYear;
  return true;
}

function pad(number) { return String(number).padStart(2, "0"); }

export function formatDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(date, amount) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + amount);
  return result;
}

export function getWeekStart(date = new Date()) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = result.getDay() || 7;
  result.setDate(result.getDate() - weekday + 1);
  return result;
}

export function getWeekDates(date = new Date()) {
  const start = typeof date === "string" ? getWeekStart(parseDate(date)) : getWeekStart(date);
  return Array.from({ length: 6 }, (_, index) => addDays(start, index));
}

function normalizeSchedules(state) {
  const hasLegacySchedule = state.schedules.some((item) => !item.date && item.weekday);
  if (!hasLegacySchedule) return false;
  const weekStart = getWeekStart(new Date());
  state.schedules = state.schedules.map((item) => {
    if (item.date) return item;
    const date = formatDate(addDays(weekStart, item.weekday - 1));
    const { weekday, ...rest } = item;
    return { ...rest, date };
  });
  return true;
}

function normalizeSeasons(state) {
  const existingIds = new Set(state.seasons.map((season) => season.id));
  const missing = seed.seasons.filter((season) => !existingIds.has(season.id));
  if (!missing.length) return false;
  state.seasons.push(...clone(missing));
  return true;
}

function normalizeScheduleOverrides(state) {
  if (Array.isArray(state.scheduleOverrides)) return false;
  state.scheduleOverrides = [];
  return true;
}

export function getState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    const initial = clone(seed);
    normalizeSchedules(initial);
    normalizeGradePromotion(initial);
    normalizeScheduleOverrides(initial);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }
  try {
    const state = JSON.parse(stored);
    const schedulesChanged = normalizeSchedules(state);
    const seasonsChanged = normalizeSeasons(state);
    const gradesChanged = normalizeGradePromotion(state);
    const overridesChanged = normalizeScheduleOverrides(state);
    if (schedulesChanged || seasonsChanged || gradesChanged || overridesChanged) saveState(state);
    return state;
  } catch {
    const initial = clone(seed);
    normalizeSchedules(initial);
    normalizeGradePromotion(initial);
    normalizeScheduleOverrides(initial);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }
}

export function saveState(state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return state; }
export function resetState() { localStorage.removeItem(STORAGE_KEY); return getState(); }
export function getStudent(state, id) { return state.students.find((student) => student.id === id); }
export function getSeasonForDate(state, date = new Date()) {
  const dateKey = typeof date === "string" ? date : formatDate(date);
  return state.seasons.find((season) => dateKey >= season.startDate && dateKey <= season.endDate) || state.seasons.find((season) => season.active) || state.seasons[0];
}
export function getSchedule(state, date, slot, season = DEFAULT_SEASON) {
  const dateKey = typeof date === "string" ? date : formatDate(addDays(getWeekStart(new Date()), date - 1));
  return state.schedules.find((item) => item.season === season && item.date === dateKey && item.slot === slot);
}

function getWeekKey(date) {
  const value = typeof date === "string" ? parseDate(date) : date;
  return formatDate(getWeekStart(value));
}

function hasScheduleOverride(state, studentId, date, season) {
  const weekStart = getWeekKey(date);
  return (state.scheduleOverrides || []).some((item) => item.studentId === studentId && item.season === season && item.weekStart === weekStart);
}

function markScheduleOverride(state, studentId, date, season) {
  if (!studentId || !date || !season) return;
  if (!Array.isArray(state.scheduleOverrides)) state.scheduleOverrides = [];
  if (hasScheduleOverride(state, studentId, date, season)) return;
  state.scheduleOverrides.push({ studentId, season, weekStart: getWeekKey(date) });
}

function copyMissingStudents(state, targetDate, targetSeason, previousDate, previousSeason) {
  const targetKey = formatDate(targetDate);
  const previousKey = formatDate(previousDate);
  const previousSchedules = state.schedules.filter((item) => item.season === previousSeason.id && item.date === previousKey);
  let changed = false;

  previousSchedules.forEach((previousSchedule) => {
    const targetSchedule = getSchedule(state, targetKey, previousSchedule.slot, targetSeason.id);
    const existingStudentIds = targetSchedule?.studentIds || [];
    const studentIds = previousSchedule.studentIds.filter((studentId) => !existingStudentIds.includes(studentId) && !hasScheduleOverride(state, studentId, targetKey, targetSeason.id));
    if (!studentIds.length) return;
    setSchedule(state, targetKey, previousSchedule.slot, [...existingStudentIds, ...studentIds], targetSeason.id);
    changed = true;
  });

  return changed;
}

export function ensureWeek(state, date, season) {
  const weekDates = getWeekDates(date);
  if (!season) {
    let changed = false;
    weekDates.forEach((targetDate) => {
      const targetSeason = getSeasonForDate(state, targetDate);
      if (!targetSeason) return;
      const previousDate = addDays(targetDate, -7);
      const previousSeason = getSeasonForDate(state, previousDate);
      if (!previousSeason || previousSeason.id !== targetSeason.id) return;
      if (copyMissingStudents(state, targetDate, targetSeason, previousDate, previousSeason)) changed = true;
    });
    return changed;
  }
  const previousKeys = new Set(weekDates.map((item) => formatDate(addDays(item, -7))));
  const previousWeek = state.schedules.filter((item) => item.season === season && previousKeys.has(item.date));
  const previousDates = [...new Set(previousWeek.map((item) => item.date))];
  let changed = false;
  previousDates.forEach((previousKey) => {
    const previousDate = parseDate(previousKey);
    const targetDate = addDays(previousDate, 7);
    const targetSeason = getSeasonForDate(state, targetDate);
    if (!targetSeason || targetSeason.id !== season) return;
    if (copyMissingStudents(state, targetDate, targetSeason, previousDate, { id: season })) changed = true;
  });
  return changed;
}

export function setSchedule(state, date, slot, studentIds, season = DEFAULT_SEASON) {
  const index = state.schedules.findIndex((item) => item.season === season && item.date === date && item.slot === slot);
  const ids = [...new Set(studentIds)];
  if (!ids.length) {
    if (index >= 0) state.schedules.splice(index, 1);
    return state;
  }
  if (index >= 0) state.schedules[index].studentIds = ids;
  else state.schedules.push({ id: makeId("schedule"), season, date, slot, studentIds: ids });
  return state;
}

function applyStudentMove(state, studentId, source, target, season = DEFAULT_SEASON) {
  if (source && (source.date !== target.date || source.slot !== target.slot)) {
    const sourceSeason = source.season || season;
    const sourceSchedule = getSchedule(state, source.date, source.slot, sourceSeason);
    if (sourceSchedule) setSchedule(state, source.date, source.slot, sourceSchedule.studentIds.filter((id) => id !== studentId), sourceSeason);
  }
  const targetSeason = target.season || season;
  const targetSchedule = getSchedule(state, target.date, target.slot, targetSeason);
  setSchedule(state, target.date, target.slot, [...(targetSchedule?.studentIds || []), studentId], targetSeason);
}

function shiftScheduleLocation(state, location, weeks, season = DEFAULT_SEASON) {
  if (!location?.date) return null;
  const expectedSeason = location.season || season;
  const date = formatDate(addDays(parseDate(location.date), weeks * 7));
  const nextSeason = getSeasonForDate(state, date)?.id;
  if (!nextSeason || nextSeason !== expectedSeason) return null;
  return { ...location, date, season: nextSeason };
}

export function moveStudent(state, studentId, source, target, season = DEFAULT_SEASON) {
  const sourceSeason = source?.season || season;
  const targetSeason = target.season || season;
  markScheduleOverride(state, studentId, target.date, targetSeason);
  if (source) markScheduleOverride(state, studentId, source.date, sourceSeason);
  applyStudentMove(state, studentId, source, target, season);

  if (sourceSeason === targetSeason) {
    for (let weeks = 1; ; weeks += 1) {
      const nextTarget = shiftScheduleLocation(state, target, weeks, targetSeason);
      if (!nextTarget || hasScheduleOverride(state, studentId, nextTarget.date, nextTarget.season)) break;
      const nextSource = source ? shiftScheduleLocation(state, source, weeks, sourceSeason) : null;
      if (source && !nextSource) break;
      applyStudentMove(state, studentId, nextSource, nextTarget, nextTarget.season);
    }
  }

  return saveState(state);
}
export function getTodayDate() {
  const now = new Date();
  return formatDate(now);
}

function isDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = parseDate(value);
  return formatDate(date) === value;
}

export function getSelectedAttendanceDate() {
  const today = getTodayDate();
  const stored = localStorage.getItem(ATTENDANCE_DATE_KEY);
  if (!stored || !isDateKey(stored) || stored > today) {
    localStorage.setItem(ATTENDANCE_DATE_KEY, today);
    return today;
  }
  return stored;
}

export function setSelectedAttendanceDate(date) {
  const today = getTodayDate();
  const selected = isDateKey(date) && date <= today ? date : today;
  localStorage.setItem(ATTENDANCE_DATE_KEY, selected);
  return selected;
}

export function getWeekday(date = new Date()) { return date.getDay() || 7; }
export function getTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}
export function makeId(prefix = "id") { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

export function markPresent(state, studentId, date, slot, arrivalTime = getTime()) {
  const student = getStudent(state, studentId);
  if (!student) return state;
  const existing = state.attendance.find((item) => item.studentId === studentId && item.date === date && item.slot === slot && item.type !== "leave");
  if (existing) { existing.arrivalTime = arrivalTime; return saveState(state); }
  const lessonNumber = student.lessonCount + 1;
  state.attendance.push({ id: makeId("att"), studentId, date, slot, arrivalTime, lessonNumber, term: student.term });
  student.lessonCount = lessonNumber;
  if (student.lessonCount >= 24) student.paymentPending = true;
  return saveState(state);
}

export function confirmPayment(state, studentId) {
  const student = getStudent(state, studentId);
  if (student) { student.lessonCount = 0; student.term += 1; student.paymentPending = false; }
  return saveState(state);
}
