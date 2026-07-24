import { ensureWeek, getSchedule, getSeasonForDate, getSelectedAttendanceDate, getStudent, getTodayDate, getTime, getWeekStart, getWeekday, markPresent, parseDate, saveState, setSelectedAttendanceDate } from "../store.js";

const slots = ["15:00", "16:30", "18:00", "19:00", "19:30", "21:00"];
const weekdays = ["週一", "週二", "週三", "週四", "週五", "週六"];

function displayDate(date) {
  const [year, month, day] = date.split("-");
  return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`;
}

export function renderRollCall(state, refresh) {
  const date = getSelectedAttendanceDate();
  const dateObject = parseDate(date);
  const weekday = getWeekday(dateObject);
  const pageTitle = date === getTodayDate() ? "今日點名" : "歷史點名";
  const season = getSeasonForDate(state, date);
  if (ensureWeek(state, getWeekStart(dateObject))) saveState(state);
  const todaySchedules = slots.map((slot) => ({ slot, schedule: getSchedule(state, date, slot, season?.id) })).filter((item) => item.schedule);
  const present = state.attendance.filter((item) => item.date === date && item.type !== "leave").length;
  const pending = state.students.filter((student) => student.paymentPending).length;
  const activeStudents = todaySchedules.flatMap(({ schedule }) => schedule.studentIds).filter((id, index, list) => list.indexOf(id) === index);

  return `
    <div class="page-head">
      <div class="date-control"><label for="attendance-date">點名日期</label><input class="input" id="attendance-date" type="date" value="${date}" max="${getTodayDate()}" /></div>
      <div><p class="eyebrow">${weekdays[weekday - 1] || "今天"}</p><h2>${pageTitle}</h2><p>${displayDate(date)}・本機測試資料</p></div>
      <button class="button-secondary" data-action="refresh">重新整理</button>
    </div>
    <div class="stat-grid">
      <div class="stat"><div class="stat-label">當日課程人次</div><div class="stat-value">${activeStudents.length}</div><div class="stat-note">依選定日期排課</div></div>
      <div class="stat"><div class="stat-label">當日已到班</div><div class="stat-value">${present}</div><div class="stat-note">含其他時段紀錄</div></div>
      <div class="stat"><div class="stat-label">待繳費</div><div class="stat-value">${pending}</div><div class="stat-note">仍可正常點名</div></div>
    </div>
    <div class="class-list">
      ${todaySchedules.length ? todaySchedules.map(({ slot, schedule }) => renderClass(state, date, slot, schedule, refresh)).join("") : '<div class="panel empty">今天沒有排課資料。</div>'}
    </div>`;
}

function renderClass(state, date, slot, schedule, refresh) {
  return `<section class="class-section"><div class="class-heading"><h3>${slot}</h3><span>${schedule.studentIds.length} 人</span></div><div class="class-students">${schedule.studentIds.map((id) => renderStudent(state, date, slot, id, refresh)).join("")}</div></section>`;
}

function renderStudent(state, date, slot, id, refresh) {
  const student = getStudent(state, id);
  const record = state.attendance.find((item) => item.studentId === id && item.date === date && item.slot === slot && item.type !== "leave");
  if (!student) return "";
  return `<article class="student-card ${record ? "is-present" : ""}"><div class="student-summary"><span class="grade-badge">${student.grade} 年級</span><div><div class="student-name">${student.name}</div><div class="student-subtitle">第 ${student.lessonCount} / 24 堂・第 ${student.term} 期 ${student.status === "paused" ? "・停課" : ""}</div></div>${student.paymentPending ? '<span class="pending-badge">待繳費</span>' : ""}</div><div class="attendance-actions">${record ? `<span class="attendance-time">${record.arrivalTime} 到班</span>` : ""}<button class="button-attend" data-action="attend" data-student-id="${id}" data-slot="${slot}">${record ? "修改時間" : "到班"}</button></div></article>`;
}

export function bindRollCall(app, state, refresh) {
  app.querySelector("#attendance-date")?.addEventListener("change", (event) => {
    setSelectedAttendanceDate(event.target.value);
    refresh();
  });
  app.querySelectorAll('[data-action="attend"]').forEach((button) => button.addEventListener("click", () => {
    const student = getStudent(state, button.dataset.studentId);
    const date = getSelectedAttendanceDate();
    const current = state.attendance.find((item) => item.studentId === student.id && item.date === date && item.slot === button.dataset.slot);
    const arrivalTime = window.prompt("請輸入到班時間（HH:mm）", current?.arrivalTime || getTime());
    if (!arrivalTime) return;
    markPresent(state, student.id, date, button.dataset.slot, arrivalTime);
    refresh();
  }));
}
