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

export function getState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return clone(seed);
  }
  try { return JSON.parse(stored); } catch { localStorage.setItem(STORAGE_KEY, JSON.stringify(seed)); return clone(seed); }
}

export function saveState(state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return state; }
export function resetState() { localStorage.removeItem(STORAGE_KEY); return getState(); }
export function getStudent(state, id) { return state.students.find((student) => student.id === id); }
export function getSchedule(state, weekday, slot, season = "summer-2026") {
  return state.schedules.find((item) => item.season === season && item.weekday === weekday && item.slot === slot);
}
export function getTodayDate() {
  const now = new Date();
  const pad = (number) => String(number).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
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
