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
import { getScheduleSlotsForWeekday } from "../domain/schedule.js";
import {
  getPaymentReminderItems,
  needsPaymentReminder,
} from "../domain/payments.js";
import {
  markAttendance,
  removeLatestAttendance,
  updateAttendanceTime,
} from "../repositories/attendance-repository.js";
import {
  addTemporaryScheduleEntries,
  ensureScheduleWeek,
} from "../repositories/schedule-repository.js";
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
  const scheduleSlots = getScheduleSlotsForWeekday(season, weekday);
  const activeStudentIds = new Set(
    state.students.filter((student) => student.status === "active").map((student) => student.id),
  );
  const todaySchedules = scheduleSlots.map((slot) => {
    const schedule = getSchedule(state, date, slot, season?.id) || { studentIds: [] };
    return {
      slot,
      schedule: {
        ...schedule,
        studentIds: schedule.studentIds.filter((studentId) => (
          getStudent(state, studentId)?.status === "active"
        )),
      },
    };
  });
  const present = state.attendance.filter((item) => (
    item.dateKey === date && activeStudentIds.has(item.studentId)
  )).length;
  const pending = getPaymentReminderItems(state.students, state.billingCycles).length;
  const scheduledPersonCount = todaySchedules.reduce((
    count,
    { schedule },
  ) => count + schedule.studentIds.length, 0);

  return `
    <div class="page-head roll-call-page-head">
      <div class="date-control"><label for="attendance-date">點名日期</label><input class="input" id="attendance-date" type="date" value="${date}" max="${getTodayDate()}" /></div>
      <div class="roll-call-title"><p class="eyebrow">${weekdays[weekday - 1] || "今天"}</p><h2>${pageTitle}</h2><p>${displayDate(date)}・雲端即時資料</p></div>
      <button class="button-secondary" data-action="refresh">重新整理</button>
    </div>
    <div class="stat-grid">
      <div class="stat"><div class="stat-label">當日課程人次</div><div class="stat-value">${scheduledPersonCount}</div><div class="stat-note">依選定日期排課</div></div>
      <div class="stat"><div class="stat-label">當日已到班</div><div class="stat-value">${present}</div><div class="stat-note">含其他時段紀錄</div></div>
      <div class="stat"><div class="stat-label">待繳費</div><div class="stat-value">${pending}</div><div class="stat-note">仍可正常點名</div></div>
    </div>
    <div class="class-list">
      ${todaySchedules.length
        ? todaySchedules.map(({ slot, schedule }) => renderClass(state, date, slot, schedule, refresh)).join("")
        : '<div class="panel empty"><strong>今日未營業</strong><p>這個日期沒有開放上課時段。</p></div>'}
    </div>`;
}

function renderClass(state, date, slot, schedule, refresh) {
  return `<section class="class-section"><div class="class-heading"><h3>${slot}</h3><span>${schedule.studentIds.length} 人</span></div><div class="class-students">${schedule.studentIds.map((id) => renderStudent(state, date, slot, id, refresh)).join("")}${renderTemporaryStudentCard(slot)}</div></section>`;
}

function renderTemporaryStudentCard(slot) {
  return `<button class="student-card temporary-student-card" data-action="add-temporary-students" data-slot="${escapeAttribute(slot)}" type="button"><span class="temporary-student-icon" aria-hidden="true">＋</span><span><strong>新增臨時學生</strong><small>只加入本日，不會立即點名</small></span></button>`;
}

function renderStudent(state, date, slot, id, refresh) {
  const student = getStudent(state, id);
  const record = state.attendance.find((item) => item.studentId === id && item.dateKey === date && item.slot === slot);
  if (!student) return "";
  const displayedLessonNumber = record?.lessonNumber ?? student.currentLessonCount;
  const paymentReminder = needsPaymentReminder(student, state.billingCycles);
  return `<article class="student-card roll-call-student-card ${record ? "is-present" : ""}"><div class="student-summary"><div><div class="student-name-row"><div class="student-name${paymentReminder ? " is-payment-pending" : ""}">${escapeHtml(student.name)}</div><span class="grade-badge">${student.grade} 年級</span></div><div class="student-subtitle">第 ${displayedLessonNumber} 堂</div><div class="roll-call-mobile-meta">${displayedLessonNumber} / ${record ? escapeHtml(record.arrivalTime) : "未到"}</div></div></div><div class="attendance-actions">${record ? `<span class="attendance-time">${escapeHtml(record.arrivalTime)} 到班</span><button class="button-secondary button-edit-attendance" data-action="edit-attendance" data-attendance-id="${escapeAttribute(record.id)}"><span class="roll-call-desktop-label">修改點名</span><span class="roll-call-mobile-label">修改</span></button>` : `<button class="button-attend" data-action="attend" data-student-id="${escapeAttribute(id)}" data-slot="${escapeAttribute(slot)}">到班</button>`}</div></article>`;
}

function closeAttendanceModal(backdrop) {
  backdrop?.remove();
}

function openTemporaryStudentModal(app, state, {
  dateKey,
  slot,
  seasonId,
}, showToast) {
  const scheduledStudentIds = new Set(getSchedule(state, dateKey, slot, seasonId)?.studentIds || []);
  const availableStudents = state.students
    .filter((student) => student.status === "active" && !scheduledStudentIds.has(student.id))
    .sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name, "zh-Hant"));
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const modal = document.createElement("section");
  modal.className = "modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "temporary-student-title");
  modal.innerHTML = `<form class="modal-form" data-temporary-student-form><div class="modal-head"><div><h3 id="temporary-student-title">新增臨時學生</h3><p class="student-subtitle">${escapeHtml(`${dateKey}・${slot}`)}，只新增排課，不會立即點名。</p></div><button class="modal-close" type="button" data-close-modal>關閉</button></div><div class="field"><label for="temporary-student-search">搜尋學生</label><input class="input" id="temporary-student-search" type="search" autocomplete="off" placeholder="輸入學生姓名" /></div><div class="checkbox-list temporary-student-list" data-temporary-student-list>${availableStudents.map((student) => `<label class="checkbox-item temporary-student-option" data-search-text="${escapeAttribute(`${student.name}${student.grade}`)}"><input type="checkbox" name="studentIds" value="${escapeAttribute(student.id)}" /><span><strong>${escapeHtml(student.name)}</strong><small>${student.grade} 年級・第 ${student.currentLessonCount} / 24 堂</small></span></label>`).join("")}</div><p class="panel empty temporary-student-empty" data-temporary-student-empty ${availableStudents.length ? "hidden" : ""}>沒有可加入的學生。</p><div class="temporary-student-selection" data-temporary-student-selection>已選取 0 位</div><div class="form-actions"><button class="button-secondary" type="button" data-cancel>取消</button><button class="button-primary" type="submit" disabled>加入學生</button></div></form>`;
  backdrop.append(modal);
  app.append(backdrop);

  const form = modal.querySelector("[data-temporary-student-form]");
  const search = modal.querySelector("#temporary-student-search");
  const options = [...modal.querySelectorAll(".temporary-student-option")];
  const empty = modal.querySelector("[data-temporary-student-empty]");
  const selection = modal.querySelector("[data-temporary-student-selection]");
  const submitButton = form.querySelector('[type="submit"]');
  const close = () => closeAttendanceModal(backdrop);
  const updateSelection = () => {
    const selectedCount = form.querySelectorAll('input[name="studentIds"]:checked').length;
    selection.textContent = `已選取 ${selectedCount} 位`;
    submitButton.disabled = selectedCount === 0;
  };

  modal.querySelector("[data-close-modal]").addEventListener("click", close);
  modal.querySelector("[data-cancel]").addEventListener("click", close);
  modal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  search.addEventListener("input", (event) => {
    const query = event.target.value.trim().toLocaleLowerCase();
    let visibleCount = 0;
    options.forEach((option) => {
      const matches = !query || (option.dataset.searchText || "").toLocaleLowerCase().includes(query);
      option.hidden = !matches;
      if (matches) visibleCount += 1;
    });
    empty.hidden = visibleCount > 0;
  });
  form.addEventListener("change", updateSelection);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const studentIds = [...form.querySelectorAll('input[name="studentIds"]:checked')]
      .map((input) => input.value);
    if (!studentIds.length) return;
    submitButton.disabled = true;
    try {
      const addedCount = await addTemporaryScheduleEntries(studentIds, {
        dateKey,
        slot,
        seasonId,
      });
      close();
      showToast(`已加入 ${addedCount} 位臨時學生，尚未點名`);
    } catch (error) {
      submitButton.disabled = false;
      showToast(getUserErrorMessage(error, "臨時學生加入失敗"));
    }
  });
  search.focus();
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
    ensureScheduleWeek(selectedDate, selectedSeason.id, {
      startDate: selectedSeason.startDate,
      endDate: selectedSeason.endDate,
    }).catch((error) => {
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
  app.querySelectorAll('[data-action="add-temporary-students"]').forEach((button) => {
    button.addEventListener("click", () => {
      if (!selectedSeason?.id) {
        showToast("找不到這個日期所屬的排課時段");
        return;
      }
      openTemporaryStudentModal(app, state, {
        dateKey: selectedDate,
        slot: button.dataset.slot,
        seasonId: selectedSeason.id,
      }, showToast);
    });
  });
}
