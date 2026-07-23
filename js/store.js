const STORAGE_KEY = "mpm-attendance-prototype-v1";

const seed = {
  seasons: [{ id: "summer-2026", name: "2026 暑假", startDate: "2026-07-01", endDate: "2026-08-31", active: true }],
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

export function getState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    const initial = clone(seed);
    normalizeSchedules(initial);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }
  try {
    const state = JSON.parse(stored);
    if (normalizeSchedules(state)) saveState(state);
    return state;
  } catch { localStorage.setItem(STORAGE_KEY, JSON.stringify(seed)); return clone(seed); }
}

export function saveState(state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return state; }
export function resetState() { localStorage.removeItem(STORAGE_KEY); return getState(); }
export function getStudent(state, id) { return state.students.find((student) => student.id === id); }
export function getSchedule(state, date, slot, season = DEFAULT_SEASON) {
  const dateKey = typeof date === "string" ? date : formatDate(addDays(getWeekStart(new Date()), date - 1));
  return state.schedules.find((item) => item.season === season && item.date === dateKey && item.slot === slot);
}

export function ensureWeek(state, date, season = DEFAULT_SEASON) {
  const weekDates = getWeekDates(date);
  const weekKeys = new Set(weekDates.map(formatDate));
  if (state.schedules.some((item) => item.season === season && weekKeys.has(item.date))) return false;

  const previousKeys = new Set(weekDates.map((item) => formatDate(addDays(item, -7))));
  const previousWeek = state.schedules.filter((item) => item.season === season && previousKeys.has(item.date));
  if (!previousWeek.length) return false;
  state.schedules.push(...previousWeek.map((item) => ({ ...clone(item), id: makeId("schedule"), date: formatDate(addDays(parseDate(item.date), 7)) })));
  return true;
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

export function moveStudent(state, studentId, source, target, season = DEFAULT_SEASON) {
  if (source && (source.date !== target.date || source.slot !== target.slot)) {
    const sourceSchedule = getSchedule(state, source.date, source.slot, season);
    if (sourceSchedule) setSchedule(state, source.date, source.slot, sourceSchedule.studentIds.filter((id) => id !== studentId), season);
  }
  const targetSchedule = getSchedule(state, target.date, target.slot, season);
  setSchedule(state, target.date, target.slot, [...(targetSchedule?.studentIds || []), studentId], season);
  return saveState(state);
}
export function getTodayDate() {
  const now = new Date();
  return formatDate(now);
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
