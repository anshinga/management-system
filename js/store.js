const ATTENDANCE_DATE_KEY = "mpm-selected-attendance-date";

function pad(number) {
  return String(number).padStart(2, "0");
}

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

export function getStudent(state, id) {
  return state.students.find((student) => student.id === id);
}

export function getSeasonForDate(state, date = new Date()) {
  const dateKey = typeof date === "string" ? date : formatDate(date);
  return state.seasons.find((season) => dateKey >= season.startDate && dateKey <= season.endDate)
    || state.seasons.find((season) => season.active)
    || state.seasons[0];
}

export function getSchedule(state, date, slot, seasonId) {
  const dateKey = typeof date === "string" ? date : formatDate(date);
  return state.schedules.find((item) => item.season === seasonId
    && item.date === dateKey
    && item.slot === slot);
}

export function getTodayDate() {
  return formatDate(new Date());
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

export function getWeekday(date = new Date()) {
  return date.getDay() || 7;
}

export function getTime() {
  const now = new Date();
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
