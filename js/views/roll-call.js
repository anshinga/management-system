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
  cancelStudentLeave,
  markStudentLeave,
} from "../repositories/leave-repository.js";
import {
  addTemporaryScheduleEntries,
  ensureScheduleWeek,
  moveScheduleEntryForDate,
} from "../repositories/schedule-repository.js";
import { escapeAttribute, escapeHtml } from "../ui/html.js";
import { getUserErrorMessage } from "../ui/errors.js";

const weekdays = ["週一", "週二", "週三", "週四", "週五", "週六"];
let lastEnsuredAttendanceWeekKey = "";

function displayDate(date) {
  const [year, month, day] = date.split("-");
  return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`;
}

function timestampToMillis(value) {
  if (typeof value?.toMillis === "function") {
    const millis = value.toMillis();
    return Number.isFinite(millis) ? millis : null;
  }
  if (Number.isFinite(value?.seconds)) {
    return (value.seconds * 1000) + (Number(value.nanoseconds || 0) / 1_000_000);
  }
  if (value instanceof Date) {
    const millis = value.getTime();
    return Number.isFinite(millis) ? millis : null;
  }
  return null;
}

function compareFallbackArrivalTime(a, b) {
  const aTime = typeof a.record?.arrivalTime === "string" ? a.record.arrivalTime : "";
  const bTime = typeof b.record?.arrivalTime === "string" ? b.record.arrivalTime : "";
  if (aTime && bTime && aTime !== bTime) return aTime.localeCompare(bTime);
  if (aTime && !bTime) return -1;
  if (!aTime && bTime) return 1;
  return a.index - b.index;
}

export function sortRollCallStudentIds(
  studentIds,
  { attendance = [], leaveRecords = [], dateKey, slot },
) {
  const attendanceByStudentId = new Map(attendance
    .filter((record) => record.dateKey === dateKey && record.slot === slot)
    .map((record) => [record.studentId, record]));
  const leaveStudentIds = new Set(leaveRecords
    .filter((record) => record.dateKey === dateKey && record.slot === slot)
    .map((record) => record.studentId));

  const sortableStudents = studentIds.map((studentId, index) => {
    const record = attendanceByStudentId.get(studentId);
    return {
      studentId,
      index,
      record,
      createdAtMillis: timestampToMillis(record?.createdAt),
      priority: record ? 0 : leaveStudentIds.has(studentId) ? 2 : 1,
    };
  });
  const allAttendanceHasTimestamps = sortableStudents
    .filter((item) => item.priority === 0)
    .every((item) => item.createdAtMillis !== null);

  return sortableStudents
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.priority !== 0) return a.index - b.index;

      if (allAttendanceHasTimestamps && a.createdAtMillis !== b.createdAtMillis) {
        return a.createdAtMillis - b.createdAtMillis;
      }
      return compareFallbackArrivalTime(a, b);
    })
    .map(({ studentId }) => studentId);
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
  const leaveCount = (state.leaveRecords || []).filter((item) => (
    item.dateKey === date
    && activeStudentIds.has(item.studentId)
    && todaySchedules.some(({ slot, schedule }) => (
      slot === item.slot && schedule.studentIds.includes(item.studentId)
    ))
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
      <div class="stat"><div class="stat-label">當日已到班</div><div class="stat-value">${present}</div><div class="stat-note">請假 ${leaveCount} 人次</div></div>
      <div class="stat"><div class="stat-label">待繳費</div><div class="stat-value">${pending}</div><div class="stat-note">仍可正常點名</div></div>
    </div>
    <div class="class-list">
      ${todaySchedules.length
        ? todaySchedules.map(({ slot, schedule }) => renderClass(
            state,
            date,
            slot,
            schedule,
            season?.id,
          )).join("")
        : '<div class="panel empty"><strong>今日未營業</strong><p>這個日期沒有開放上課時段。</p></div>'}
    </div>`;
}

function renderClass(state, date, slot, schedule, seasonId) {
  const temporaryStudentIds = new Set(schedule.temporaryStudentIds || []);
  const resolvedSeasonId = seasonId || schedule.season || "";
  const orderedStudentIds = sortRollCallStudentIds(schedule.studentIds, {
    attendance: state.attendance,
    leaveRecords: state.leaveRecords || [],
    dateKey: date,
    slot,
  });
  return `<section class="class-section"><div class="class-heading"><h3>${slot}</h3><span>${schedule.studentIds.length} 人</span></div><div class="class-students roll-call-drop-zone" data-roll-call-drop-slot="${escapeAttribute(slot)}" data-roll-call-date="${escapeAttribute(date)}" data-roll-call-season="${escapeAttribute(resolvedSeasonId)}">${orderedStudentIds.map((id) => renderStudent(state, date, slot, id, {
    seasonId: resolvedSeasonId,
    isTemporary: temporaryStudentIds.has(id),
  })).join("")}${renderTemporaryStudentCard(slot)}</div></section>`;
}

function renderTemporaryStudentCard(slot) {
  return `<button class="student-card temporary-student-card" data-action="add-temporary-students" data-slot="${escapeAttribute(slot)}" type="button"><span class="temporary-student-icon" aria-hidden="true">＋</span><span><strong>新增臨時學生</strong><small>只加入本日，不會立即點名</small></span></button>`;
}

export function renderTemporaryStudentOption(student) {
  return `<label class="checkbox-item temporary-student-option" data-search-text="${escapeAttribute(`${student.name}${student.grade}`)}"><input type="checkbox" name="studentIds" value="${escapeAttribute(student.id)}" /><span><strong>${escapeHtml(student.name)}</strong><small>${student.grade} 年級<span class="temporary-student-lesson">・第 ${student.currentLessonCount} / 24 堂</span></small></span></label>`;
}

export function shouldAutoFocusTemporaryStudentSearch(viewport = globalThis) {
  return viewport.matchMedia?.("(min-width: 721px)")?.matches === true;
}

function renderStudent(state, date, slot, id, { seasonId, isTemporary }) {
  const student = getStudent(state, id);
  const record = state.attendance.find((item) => item.studentId === id && item.dateKey === date && item.slot === slot);
  const leaveRecord = (state.leaveRecords || []).find((item) => (
    item.studentId === id && item.dateKey === date && item.slot === slot
  ));
  if (!student) return "";
  const displayedLessonNumber = record?.lessonNumber ?? student.currentLessonCount;
  const paymentReminder = needsPaymentReminder(student, state.billingCycles);
  const isResolved = Boolean(record || leaveRecord);
  const moveAttributes = isResolved ? "" : ` draggable="true" data-roll-call-student="${escapeAttribute(id)}" data-roll-call-date="${escapeAttribute(date)}" data-roll-call-slot="${escapeAttribute(slot)}" data-roll-call-season="${escapeAttribute(seasonId)}" data-roll-call-temporary="${isTemporary}"`;
  const dragHandle = isResolved ? "" : `<button class="roll-call-drag-handle" data-action="drag-roll-call-student" type="button" aria-label="拖曳 ${escapeAttribute(student.name)} 調整今日時段" title="拖曳調整今日時段"><span aria-hidden="true">⋮⋮</span></button>`;
  const cardStatusClass = record ? " is-present" : leaveRecord ? " is-on-leave" : " is-draggable";
  const statusText = record ? escapeHtml(record.arrivalTime) : leaveRecord ? "請假" : "未到";
  const actions = record
    ? `<span class="attendance-time">${escapeHtml(record.arrivalTime)} 到班</span><button class="button-secondary button-edit-attendance" data-action="edit-attendance" data-attendance-id="${escapeAttribute(record.id)}"><span class="roll-call-desktop-label">修改點名</span><span class="roll-call-mobile-label">修改</span></button>`
    : leaveRecord
      ? `<span class="leave-status">請假</span><button class="button-secondary button-cancel-leave" data-action="cancel-leave" data-student-id="${escapeAttribute(id)}" data-slot="${escapeAttribute(slot)}" type="button">取消請假</button>`
      : `<button class="button-attend" data-action="attend" data-student-id="${escapeAttribute(id)}" data-slot="${escapeAttribute(slot)}" type="button">到班</button><button class="button-leave" data-action="leave" data-student-id="${escapeAttribute(id)}" data-slot="${escapeAttribute(slot)}" type="button">請假</button>`;
  return `<article class="student-card roll-call-student-card${cardStatusClass}"${moveAttributes}><div class="student-summary"><div><div class="student-name-row"><div class="student-name${paymentReminder ? " is-payment-pending" : ""}">${escapeHtml(student.name)}</div><span class="grade-badge">${student.grade} 年級</span></div><div class="student-subtitle">第 ${displayedLessonNumber} 堂</div><div class="roll-call-mobile-meta">${displayedLessonNumber} / ${statusText}</div></div></div><div class="attendance-actions">${actions}</div>${dragHandle}</article>`;
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
  modal.innerHTML = `<form class="modal-form" data-temporary-student-form><div class="modal-head"><div><h3 id="temporary-student-title">新增臨時學生</h3><p class="student-subtitle">${escapeHtml(`${dateKey}・${slot}`)}，只新增排課，不會立即點名。</p></div><button class="modal-close" type="button" data-close-modal>關閉</button></div><div class="field"><label for="temporary-student-search">搜尋學生</label><input class="input" id="temporary-student-search" type="search" autocomplete="off" placeholder="輸入學生姓名" /></div><div class="checkbox-list temporary-student-list" data-temporary-student-list>${availableStudents.map(renderTemporaryStudentOption).join("")}</div><p class="panel empty temporary-student-empty" data-temporary-student-empty ${availableStudents.length ? "hidden" : ""}>沒有可加入的學生。</p><div class="temporary-student-selection" data-temporary-student-selection>已選取 0 位</div><div class="form-actions"><button class="button-secondary" type="button" data-cancel>取消</button><button class="button-primary" type="submit" disabled>加入學生</button></div></form>`;
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
  if (shouldAutoFocusTemporaryStudentSearch()) search.focus();
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
  modal.innerHTML = `<form class="modal-form" data-attendance-form><div class="modal-head"><h3 id="edit-attendance-title">修改點名</h3><button class="modal-close" type="button" data-close-modal>關閉</button></div><div class="modal-form-grid"><div class="field field-wide"><label for="edit-attendance-student">點名學生</label><input class="input" id="edit-attendance-student" disabled value="${escapeAttribute(student?.name || "未知學生")}" /></div><div class="field"><label for="edit-arrival-time">到班時間</label><input class="input" id="edit-arrival-time" name="arrivalTime" type="time" required value="${escapeAttribute(record.arrivalTime || "")}" /></div><div class="field"><label for="edit-attendance-date">點名日期</label><input class="input" id="edit-attendance-date" type="date" disabled value="${escapeAttribute(record.dateKey)}" /></div></div><p class="student-subtitle">只能刪除這位學生最新一筆點名；第 24 堂會自動退回原期別第 23 堂。</p><div class="form-actions"><button class="button-danger" type="button" data-remove-attendance>刪除這筆點名</button><button class="button-secondary" type="button" data-cancel>取消</button><button class="button-primary" type="submit">儲存修改</button></div></form>`;
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
    const isCompletedTerm = Number(record.lessonNumber) === 24;
    const confirmationMessage = isCompletedTerm
      ? `這筆是第 ${record.term} 期第 24 堂。刪除後會恢復為第 ${record.term} 期第 23 堂；若已有下一期點名則無法刪除。確定要繼續嗎？`
      : "確定要刪除這筆點名紀錄嗎？學生堂數也會扣回一堂。";
    if (!window.confirm(confirmationMessage)) return;
    try {
      await removeLatestAttendance(record.id);
      close();
      showToast(isCompletedTerm ? "點名已刪除，學生已恢復為原期別第 23 堂" : "點名紀錄已刪除");
    } catch (error) {
      showToast(getUserErrorMessage(error, "點名刪除失敗"));
    }
  });
}

function bindRollCallScheduleDrag(app, state, showToast) {
  const cards = [...app.querySelectorAll("[data-roll-call-student]")];
  const dropZones = [...app.querySelectorAll("[data-roll-call-drop-slot]")];
  let desktopDrag = null;
  let touchDrag = null;

  const getDragData = (card) => ({
    card,
    studentId: card.dataset.rollCallStudent,
    source: {
      dateKey: card.dataset.rollCallDate,
      slot: card.dataset.rollCallSlot,
      seasonId: card.dataset.rollCallSeason,
      ...(card.dataset.rollCallTemporary === "true" ? { temporary: true } : {}),
    },
  });
  const clearDropTargets = () => {
    dropZones.forEach((zone) => zone.classList.remove("is-roll-call-drop-target"));
  };
  const moveToZone = async (data, zone) => {
    if (!data || !zone || data.source.slot === zone.dataset.rollCallDropSlot) return;
    const target = {
      dateKey: zone.dataset.rollCallDate,
      slot: zone.dataset.rollCallDropSlot,
      seasonId: zone.dataset.rollCallSeason,
    };
    const targetSchedule = getSchedule(state, target.dateKey, target.slot, target.seasonId);
    if (targetSchedule?.studentIds.includes(data.studentId)) {
      showToast("這位學生已經在目標時段內");
      return;
    }
    if (state.attendance.some((item) => (
      item.studentId === data.studentId
      && item.dateKey === data.source.dateKey
      && item.slot === data.source.slot
    ))) {
      showToast("這位學生已完成點名，不能移動時段");
      return;
    }
    if ((state.leaveRecords || []).some((item) => (
      item.studentId === data.studentId
      && item.dateKey === data.source.dateKey
      && item.slot === data.source.slot
    ))) {
      showToast("這位學生已登記請假，請先取消請假");
      return;
    }

    data.card.classList.add("is-moving");
    data.card.setAttribute("aria-busy", "true");
    try {
      await moveScheduleEntryForDate(data.studentId, data.source, target);
      const studentName = getStudent(state, data.studentId)?.name || "學生";
      showToast(`已將 ${studentName} 移到 ${target.slot}，只調整本日`);
    } catch (error) {
      data.card.classList.remove("is-moving");
      data.card.removeAttribute("aria-busy");
      showToast(getUserErrorMessage(error, "今日時段調整失敗"));
    }
  };

  cards.forEach((card) => {
    card.addEventListener("dragstart", (event) => {
      if (event.target.closest("button")) {
        event.preventDefault();
        return;
      }
      desktopDrag = getDragData(card);
      card.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", card.dataset.rollCallStudent);
    });
    card.addEventListener("dragend", () => {
      desktopDrag = null;
      card.classList.remove("is-dragging");
      clearDropTargets();
    });
  });

  dropZones.forEach((zone) => {
    zone.addEventListener("dragover", (event) => {
      if (!desktopDrag) return;
      event.preventDefault();
      zone.classList.add("is-roll-call-drop-target");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("is-roll-call-drop-target"));
    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      zone.classList.remove("is-roll-call-drop-target");
      const data = desktopDrag;
      desktopDrag = null;
      return moveToZone(data, zone);
    });
  });

  const finishTouchDrag = (event, cancelled = false) => {
    if (!touchDrag) return;
    const zone = cancelled
      ? null
      : document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-roll-call-drop-slot]");
    touchDrag.card.classList.remove("is-dragging");
    document.removeEventListener("pointermove", moveTouchDrag);
    document.removeEventListener("pointerup", finishTouchDrag);
    document.removeEventListener("pointercancel", cancelTouchDrag);
    clearDropTargets();
    const data = touchDrag;
    touchDrag = null;
    if (zone) moveToZone(data, zone);
  };
  const cancelTouchDrag = (event) => finishTouchDrag(event, true);
  function moveTouchDrag(event) {
    if (!touchDrag) return;
    event.preventDefault();
    const zone = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-roll-call-drop-slot]");
    dropZones.forEach((item) => item.classList.toggle("is-roll-call-drop-target", item === zone));
  }

  app.querySelectorAll('[data-action="drag-roll-call-student"]').forEach((handle) => {
    handle.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse") return;
      event.preventDefault();
      const card = handle.closest("[data-roll-call-student]");
      if (!card) return;
      touchDrag = getDragData(card);
      card.classList.add("is-dragging");
      document.addEventListener("pointermove", moveTouchDrag, { passive: false });
      document.addEventListener("pointerup", finishTouchDrag);
      document.addEventListener("pointercancel", cancelTouchDrag);
    });
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
  app.querySelectorAll('[data-action="leave"]').forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await markStudentLeave({
        studentId: button.dataset.studentId,
        dateKey: selectedDate,
        slot: button.dataset.slot,
      });
      showToast("已登記請假，不會增加堂數");
    } catch (error) {
      button.disabled = false;
      showToast(getUserErrorMessage(error, "請假登記失敗"));
    }
  }));
  app.querySelectorAll('[data-action="cancel-leave"]').forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await cancelStudentLeave({
        studentId: button.dataset.studentId,
        dateKey: selectedDate,
        slot: button.dataset.slot,
      });
      showToast("已取消請假");
    } catch (error) {
      button.disabled = false;
      showToast(getUserErrorMessage(error, "取消請假失敗"));
    }
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
  bindRollCallScheduleDrag(app, state, showToast);
}
