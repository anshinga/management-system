import {
  getSchedule,
  getSeasonForDate,
  getSelectedAttendanceDate,
  getStudent,
  getTodayDate,
  getTime,
  getWeekStart,
  getWeekday,
  parseDate,
  setSelectedAttendanceDate,
} from "../store.js";
import { SCHEDULE_SLOTS } from "../config.js";
import {
  markAttendance,
  removeLatestAttendance,
  updateAttendanceTime,
} from "../repositories/attendance-repository.js";
import { ensureScheduleWeek } from "../repositories/schedule-repository.js";
import { escapeAttribute, escapeHtml } from "../ui/html.js";
import { getUserErrorMessage } from "../ui/errors.js";

const weekdays = ["週一", "週二", "週三", "週四", "週五", "週六"];
let lastEnsuredAttendanceWeekKey = "";

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
  const todaySchedules = SCHEDULE_SLOTS.map((slot) => ({ slot, schedule: getSchedule(state, date, slot, season?.id) })).filter((item) => item.schedule);
  const present = state.attendance.filter((item) => item.dateKey === date).length;
  const pending = state.billingCycles.filter((cycle) => cycle.status === "pending").length;
  const activeStudents = todaySchedules.flatMap(({ schedule }) => schedule.studentIds).filter((id, index, list) => list.indexOf(id) === index);

  return `
    <div class="page-head">
      <div class="date-control"><label for="attendance-date">點名日期</label><input class="input" id="attendance-date" type="date" value="${date}" max="${getTodayDate()}" /></div>
      <div><p class="eyebrow">${weekdays[weekday - 1] || "今天"}</p><h2>${pageTitle}</h2><p>${displayDate(date)}・雲端即時資料</p></div>
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
  const record = state.attendance.find((item) => item.studentId === id && item.dateKey === date && item.slot === slot);
  if (!student) return "";
  return `<article class="student-card ${record ? "is-present" : ""}"><div class="student-summary"><span class="grade-badge">${student.grade} 年級</span><div><div class="student-name">${escapeHtml(student.name)}</div><div class="student-subtitle">第 ${student.currentLessonCount} / 24 堂・第 ${student.currentTerm} 期 ${student.status === "paused" ? "・停課" : ""}</div></div>${student.paymentPending ? `<span class="pending-badge">${student.pendingPaymentCount} 期待付款</span>` : ""}</div><div class="attendance-actions">${record ? `<span class="attendance-time">${escapeHtml(record.arrivalTime)} 到班</span><button class="button-secondary button-edit-attendance" data-action="edit-attendance" data-attendance-id="${escapeAttribute(record.id)}">修改點名</button>` : `<button class="button-attend" data-action="attend" data-student-id="${escapeAttribute(id)}" data-slot="${escapeAttribute(slot)}">到班</button>`}</div></article>`;
}

function closeAttendanceModal(backdrop) {
  backdrop?.remove();
}

function openNewAttendanceModal(app, student, dateKey, slot, showToast) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const modal = document.createElement("section");
  modal.className = "modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "new-attendance-title");
  modal.innerHTML = `<form class="modal-form" data-new-attendance-form><div class="modal-head"><h3 id="new-attendance-title">登記到班</h3><button class="modal-close" type="button" data-close-modal>關閉</button></div><div class="modal-form-grid"><div class="field field-wide"><label>學生</label><input class="input" disabled value="${escapeAttribute(student.name)}" /></div><div class="field"><label for="new-arrival-time">到班時間</label><input class="input" id="new-arrival-time" name="arrivalTime" type="time" required value="${getTime()}" /></div><div class="field"><label>日期與時段</label><input class="input" disabled value="${escapeAttribute(`${dateKey}・${slot}`)}" /></div></div><div class="form-actions"><button class="button-secondary" type="button" data-cancel>取消</button><button class="button-primary" type="submit">確認到班</button></div></form>`;
  backdrop.append(modal);
  app.append(backdrop);
  const form = modal.querySelector("[data-new-attendance-form]");
  const close = () => closeAttendanceModal(backdrop);
  modal.querySelector("[data-close-modal]").addEventListener("click", close);
  modal.querySelector("[data-cancel]").addEventListener("click", close);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    try {
      await markAttendance({
        studentId: student.id,
        dateKey,
        slot,
        arrivalTime: form.elements.arrivalTime.value,
      });
      close();
      showToast("點名完成");
    } catch (error) {
      submitButton.disabled = false;
      showToast(getUserErrorMessage(error, "點名失敗"));
    }
  });
  form.elements.arrivalTime.focus();
}

function openAttendanceModal(app, state, record, showToast) {
  const student = getStudent(state, record.studentId);
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const modal = document.createElement("section");
  modal.className = "modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "edit-attendance-title");
  modal.innerHTML = `<form class="modal-form" data-attendance-form><div class="modal-head"><h3 id="edit-attendance-title">修改點名</h3><button class="modal-close" type="button" data-close-modal>關閉</button></div><div class="modal-form-grid"><div class="field field-wide"><label for="edit-attendance-student">點名學生</label><input class="input" id="edit-attendance-student" disabled value="${escapeAttribute(student?.name || "未知學生")}" /></div><div class="field"><label for="edit-arrival-time">到班時間</label><input class="input" id="edit-arrival-time" name="arrivalTime" type="time" required value="${escapeAttribute(record.arrivalTime || "")}" /></div><div class="field"><label for="edit-attendance-date">點名日期</label><input class="input" id="edit-attendance-date" type="date" disabled value="${escapeAttribute(record.dateKey)}" /></div></div><p class="student-subtitle">為維持堂數與付款歷史一致，已完成的點名不可改成其他學生。</p><div class="form-actions"><button class="button-danger" type="button" data-remove-attendance>刪除這筆點名</button><button class="button-secondary" type="button" data-cancel>取消</button><button class="button-primary" type="submit">儲存修改</button></div></form>`;
  backdrop.append(modal);
  app.append(backdrop);
  const form = modal.querySelector("[data-attendance-form]");
  const close = () => closeAttendanceModal(backdrop);
  modal.querySelector("[data-close-modal]").addEventListener("click", close);
  modal.querySelector("[data-cancel]").addEventListener("click", close);
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    try {
      await updateAttendanceTime(record.id, form.elements.arrivalTime.value);
      close();
      showToast("點名時間已更新");
    } catch (error) {
      submitButton.disabled = false;
      showToast(getUserErrorMessage(error, "點名修改失敗"));
    }
  });
  modal.querySelector("[data-remove-attendance]").addEventListener("click", async () => {
    if (!window.confirm("確定要刪除這筆點名紀錄嗎？學生堂數也會扣回一堂。")) return;
    try {
      await removeLatestAttendance(record.id);
      close();
      showToast("點名紀錄已刪除");
    } catch (error) {
      showToast(getUserErrorMessage(error, "點名刪除失敗"));
    }
  });
}

export function bindRollCall(app, state, refresh, showToast) {
  const selectedDate = getSelectedAttendanceDate();
  const selectedSeason = getSeasonForDate(state, selectedDate);
  const ensureKey = `${selectedSeason?.id || ""}:${getWeekStart(parseDate(selectedDate)).toISOString()}`;
  if (selectedSeason && ensureKey !== lastEnsuredAttendanceWeekKey) {
    lastEnsuredAttendanceWeekKey = ensureKey;
    ensureScheduleWeek(selectedDate, selectedSeason.id).catch((error) => {
      lastEnsuredAttendanceWeekKey = "";
      showToast(getUserErrorMessage(error, "無法沿用前一週排課"));
    });
  }
  app.querySelector("#attendance-date")?.addEventListener("change", (event) => {
    setSelectedAttendanceDate(event.target.value);
    refresh();
  });
  app.querySelectorAll('[data-action="attend"]').forEach((button) => button.addEventListener("click", () => {
    const student = getStudent(state, button.dataset.studentId);
    if (!student) return;
    const date = getSelectedAttendanceDate();
    openNewAttendanceModal(app, student, date, button.dataset.slot, showToast);
  }));
  app.querySelectorAll('[data-action="edit-attendance"]').forEach((button) => button.addEventListener("click", () => {
    const record = state.attendance.find((item) => item.id === button.dataset.attendanceId);
    if (record) openAttendanceModal(app, state, record, showToast);
  }));
}
