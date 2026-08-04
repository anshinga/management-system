import {
  addDays,
  formatDate,
  getSeasonForDate,
  getSchedule,
  getSelectedAttendanceDate,
  getStudent,
  getWeekDates,
  getWeekStart,
  parseDate,
} from "../store.js";
import { SCHEDULE_SLOTS } from "../config.js";
import {
  getScheduleSlotsForWeekday,
  hasSaturdayMorning,
  isScheduleSlotUpcoming,
} from "../domain/schedule.js";
import {
  addScheduleEntries,
  ensureScheduleWeek,
  moveScheduleEntry,
  removeScheduleEntry,
} from "../repositories/schedule-repository.js";
import { escapeAttribute, escapeHtml } from "../ui/html.js";
import { getUserErrorMessage } from "../ui/errors.js";

const weekdays = ["週一", "週二", "週三", "週四", "週五", "週六"];
let scheduleWeekStart = getWeekStart(new Date());
let selectedScheduleSeasonId = "";
let selectedMobileScheduleDateKey = "";
let scheduleSearch = "";
let paletteCollapsed = true;
let deletionMode = false;
let observedAttendanceDate = null;
let lastEnsuredWeekKey = "";
let scheduleEnsureQueue = Promise.resolve();

function shortDate(date) { return `${date.getMonth() + 1}/${date.getDate()}`; }

function fullDate(date) {
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

function sortedSeasons(state) {
  return [...state.seasons].sort((a, b) => (
    String(a.startDate).localeCompare(String(b.startDate))
  ));
}

function seasonContainsDate(season, date) {
  const dateKey = typeof date === "string" ? date : formatDate(date);
  return Boolean(season && dateKey >= season.startDate && dateKey <= season.endDate);
}

function getSelectedScheduleSeason(state, preferredDate = scheduleWeekStart) {
  const seasons = sortedSeasons(state);
  return seasons.find((season) => season.id === selectedScheduleSeasonId)
    || seasons.find((season) => seasonContainsDate(season, preferredDate))
    || seasons.find((season) => season.active)
    || seasons[0];
}

export function getSeasonNavigationDate(season, today = new Date()) {
  return seasonContainsDate(season, today) ? today : parseDate(season.startDate);
}

function renderSeasonSwitcher(state, selectedSeason) {
  const seasons = sortedSeasons(state);
  if (!seasons.length) return "";
  return `<div class="schedule-season-switcher" aria-label="切換排課時期">
    <div class="schedule-season-buttons">${seasons.map((season) => `<button class="schedule-season-button${season.id === selectedSeason?.id ? " is-active" : ""}" data-action="switch-schedule-season" data-season-id="${escapeAttribute(season.id)}" type="button" aria-pressed="${season.id === selectedSeason?.id}">${escapeHtml(season.name)}</button>`).join("")}</div>
    <label class="schedule-season-select-label" for="schedule-season-select"><span>切換時期</span><select class="select" id="schedule-season-select">${seasons.map((season) => `<option value="${escapeAttribute(season.id)}"${season.id === selectedSeason?.id ? " selected" : ""}>${escapeHtml(season.name)}</option>`).join("")}</select></label>
  </div>`;
}

function renderWeekdayScheduleGrid(state, dates, season, now) {
  return `<div class="schedule-wrap"><div class="schedule-grid" style="--schedule-day-count: ${dates.length}"><div class="schedule-label">時間</div>${dates.map((date, index) => `<div class="schedule-day${seasonContainsDate(season, date) ? "" : " is-outside-season"}"><strong>${shortDate(date)} ${weekdays[index]}</strong></div>`).join("")}${SCHEDULE_SLOTS.map((slot) => `<div class="schedule-label">${slot}</div>${dates.map((date) => renderCell(state, date, slot, season, now)).join("")}`).join("")}</div></div>`;
}

function renderSaturdaySchedule(state, date, season, now) {
  const slots = [
    { start: "09:00", end: "10:30" },
    { start: "10:30", end: "12:00" },
  ];
  return `<aside class="schedule-saturday-panel"><div class="schedule-saturday-head"><span>週六上午</span><strong>${shortDate(date)} ${weekdays[5]}</strong></div><div class="schedule-saturday-slots">${slots.map(({ start, end }) => `<section class="schedule-saturday-slot"><div class="schedule-saturday-time">${start}–${end}</div>${renderCell(state, date, start, season, now)}</section>`).join("")}</div></aside>`;
}

function renderMobileScheduleBoard(state, dates, selectedDate, season, now) {
  if (!selectedDate) {
    return '<div class="schedule-mobile-board"><div class="empty">這一週沒有可排課日期。</div></div>';
  }
  const selectedDateKey = formatDate(selectedDate);
  const weekday = selectedDate.getDay() || 7;
  const slots = getScheduleSlotsForWeekday(season, weekday);
  const slotLabel = (slot) => {
    if (weekday !== 6) return slot;
    return slot === "09:00" ? "09:00–10:30" : "10:30–12:00";
  };
  return `<div class="schedule-mobile-board"><div class="schedule-mobile-date-tabs" aria-label="選擇排課日期">${dates.map((date) => {
    const dateKey = formatDate(date);
    const day = date.getDay() || 7;
    return `<button class="schedule-mobile-date-button${dateKey === selectedDateKey ? " is-active" : ""}" data-action="select-mobile-schedule-date" data-date="${dateKey}" type="button" aria-pressed="${dateKey === selectedDateKey}"><span>${weekdays[day - 1]}</span><strong>${date.getDate()}</strong></button>`;
  }).join("")}</div><div class="schedule-mobile-slot-list">${slots.map((slot) => `<section class="schedule-mobile-slot"><div class="schedule-mobile-slot-heading"><h3>${slotLabel(slot)}</h3></div>${renderCell(state, selectedDate, slot, season, now)}</section>`).join("")}</div></div>`;
}

export function renderSchedule(state, { now = new Date() } = {}) {
  const attendanceDate = getSelectedAttendanceDate();
  if (observedAttendanceDate !== attendanceDate) {
    scheduleWeekStart = getWeekStart(parseDate(attendanceDate));
    selectedScheduleSeasonId = state.seasons.find((season) => (
      seasonContainsDate(season, attendanceDate)
    ))?.id || "";
    selectedMobileScheduleDateKey = attendanceDate;
    observedAttendanceDate = attendanceDate;
  }
  scheduleWeekStart = getWeekStart(scheduleWeekStart);
  const weekDates = getWeekDates(scheduleWeekStart);
  const season = getSelectedScheduleSeason(state, attendanceDate);
  const weekdayDates = weekDates.slice(0, 5);
  const showSaturday = hasSaturdayMorning(season);
  const mobileDates = [
    ...weekdayDates,
    ...(showSaturday ? [weekDates[5]] : []),
  ].filter((date) => seasonContainsDate(season, date));
  const selectedMobileDate = mobileDates.find((date) => (
    formatDate(date) === selectedMobileScheduleDateKey
  )) || mobileDates.find((date) => formatDate(date) === attendanceDate) || mobileDates[0];
  selectedMobileScheduleDateKey = selectedMobileDate ? formatDate(selectedMobileDate) : "";
  const displayedWeekEnd = showSaturday ? weekDates[5] : weekDates[4];
  const displayedWeekEndLabel = showSaturday ? weekdays[5] : weekdays[4];
  selectedScheduleSeasonId = season?.id || "";
  const previousWeekAvailable = seasonContainsDate(season, addDays(scheduleWeekStart, -1));
  const nextWeekAvailable = seasonContainsDate(season, addDays(scheduleWeekStart, 7));
  const activeStudents = [...state.students].filter((student) => student.status === "active").sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name, "zh-Hant"));
  const filteredStudents = activeStudents.filter((student) => !scheduleSearch || `${student.name}${student.grade}`.includes(scheduleSearch));
  const groupedStudents = [...new Set(activeStudents.map((student) => student.grade))].sort((a, b) => a - b).map((grade) => ({ grade, students: activeStudents.filter((student) => student.grade === grade) }));

  return `<div class="page-head schedule-page-head"><div class="schedule-title-row"><h2>排課</h2>${renderSeasonSwitcher(state, season)}</div><button class="button-secondary schedule-edit-button${deletionMode ? " is-active" : ""}" data-action="toggle-delete-mode" type="button" aria-pressed="${deletionMode}"><span aria-hidden="true">${deletionMode ? "✓" : "✎"}</span> ${deletionMode ? "完成" : "修改排課"}</button></div>
    <div class="week-toolbar"><button class="round-button" data-action="prev-week" type="button" aria-label="上一週"${previousWeekAvailable ? "" : " disabled"}>‹</button><div class="week-title"><strong>${shortDate(weekDates[0])} ${weekdays[0]} — ${shortDate(displayedWeekEnd)} ${displayedWeekEndLabel}</strong><span>${fullDate(weekDates[0])} 至 ${fullDate(displayedWeekEnd)}</span></div><button class="round-button" data-action="next-week" type="button" aria-label="下一週"${nextWeekAvailable ? "" : " disabled"}>›</button><button class="button-secondary" data-action="current-week" type="button">回到本週</button></div>
    <div class="schedule-editor${paletteCollapsed ? " palette-collapsed" : ""}${deletionMode ? " is-delete-mode" : ""}"><aside class="student-palette"><div class="palette-head"><h3>學生</h3><div class="palette-tools"><span data-palette-count>${filteredStudents.length} / ${activeStudents.length} 位</span><button class="collapse-button" data-action="toggle-palette" type="button">收起</button></div></div><input class="input" id="schedule-search" value="${escapeAttribute(scheduleSearch)}" placeholder="搜尋姓名或年級" /><p class="drag-hint">${deletionMode ? "完成刪除編輯後，即可繼續拖曳新增或移動學生。" : "可拖曳學生卡片，或點擊時段內的加號新增學生。"}</p><div class="palette-groups">${groupedStudents.length ? groupedStudents.map(({ grade, students }) => `<section class="palette-group"><h4>${grade} 年級</h4><div class="palette-list">${students.map(renderPaletteStudent).join("")}</div></section>`).join("") : '<div class="empty">找不到學生。</div>'}</div></aside><section class="panel schedule-board"><div class="collapsed-palette-bar"><button class="button-secondary" data-action="toggle-palette" type="button">展開學生名單</button></div><div class="schedule-desktop-board"><div class="schedule-board-layout${showSaturday ? "" : " without-saturday"}">${renderWeekdayScheduleGrid(state, weekdayDates, season, now)}${showSaturday ? renderSaturdaySchedule(state, weekDates[5], season, now) : ""}</div></div>${renderMobileScheduleBoard(state, mobileDates, selectedMobileDate, season, now)}</section></div>`;
}

function renderPaletteStudent(student) {
  const interactiveAttributes = deletionMode
    ? 'draggable="false" aria-disabled="true"'
    : `draggable="true" tabindex="0" role="button" aria-label="選取 ${escapeAttribute(student.name)} 進行排課"`;
  return `<div class="drag-student palette-student" ${interactiveAttributes} data-drag-student="${escapeAttribute(student.id)}" data-drag-source="palette" data-search-text="${escapeAttribute(`${student.name}${student.grade}`)}"><span>${escapeHtml(student.name)}</span></div>`;
}

function applyScheduleSearch(app) {
  const query = scheduleSearch.toLocaleLowerCase();
  const paletteStudents = [...app.querySelectorAll(".palette-student")];
  let visibleCount = 0;

  paletteStudents.forEach((student) => {
    const matches = !query || (student.dataset.searchText || "").toLocaleLowerCase().includes(query);
    student.hidden = !matches;
    if (matches) visibleCount += 1;
  });

  app.querySelectorAll(".palette-group").forEach((group) => {
    group.hidden = ![...group.querySelectorAll(".palette-student")].some((student) => !student.hidden);
  });
  const count = app.querySelector("[data-palette-count]");
  if (count) count.textContent = `${visibleCount} / ${paletteStudents.length} 位`;
}

function renderScheduledStudent(student, {
  dateKey,
  slot,
  seasonId,
  isLocked,
  isOnLeave,
  isTemporary,
}) {
  const isResolved = isLocked || isOnLeave;
  const studentClass = `drag-student schedule-student${isLocked ? " is-present is-locked" : ""}${isOnLeave ? " is-on-leave is-locked" : ""}${deletionMode && !isResolved ? " is-delete-candidate" : ""}`;
  const sourceAttributes = `data-drag-student="${escapeAttribute(student.id)}" data-drag-source="schedule" data-source-date="${dateKey}" data-source-slot="${slot}" data-source-season="${escapeAttribute(seasonId)}" data-source-temporary="${isTemporary}"`;
  const temporaryLabel = isTemporary ? "<small>臨時</small>" : "";
  const leaveLabel = isOnLeave ? '<small class="schedule-leave-label">請假</small>' : "";

  if (deletionMode) {
    const lockedAttributes = isResolved
      ? `aria-disabled="true" title="${isOnLeave ? "已請假，請先在今日點名取消請假" : "已有點名紀錄，無法移除排課"}"`
      : `title="${isTemporary ? "移除這筆臨時排課" : "從本週起移除這位學生"}"`;
    const removeLabel = isTemporary
      ? `移除 ${escapeAttribute(student.name)} 的臨時排課`
      : `從 ${dateKey} ${slot} 起移除 ${escapeAttribute(student.name)}`;
    const removeButton = isResolved ? "" : `<button class="schedule-remove-button" data-action="remove-schedule-student" data-student-id="${escapeAttribute(student.id)}" data-student-name="${escapeAttribute(student.name)}" data-date="${dateKey}" data-slot="${slot}" data-season="${escapeAttribute(seasonId)}" data-temporary="${isTemporary}" type="button" aria-label="${removeLabel}">×</button>`;
    return `<div class="${studentClass}" ${lockedAttributes} ${sourceAttributes}><span>${escapeHtml(student.name)}</span>${temporaryLabel}${leaveLabel}${removeButton}</div>`;
  }

  const dragAttributes = isResolved
    ? `aria-disabled="true" title="${isOnLeave ? "已請假，請先在今日點名取消請假" : "已簽到，無法調整排課"}"`
    : `draggable="true" tabindex="0" role="button" aria-label="選取 ${escapeAttribute(student.name)} 以調整排課" title="拖曳或按 Enter 調整時間"`;
  return `<div class="${studentClass}" ${dragAttributes} ${sourceAttributes}><span>${escapeHtml(student.name)}</span>${temporaryLabel}${leaveLabel}</div>`;
}

function renderCell(state, date, slot, season, now) {
  const dateKey = formatDate(date);
  if (!seasonContainsDate(season, dateKey)) {
    return `<div class="schedule-cell is-outside-season" aria-disabled="true"><div class="cell-count"><span>—</span></div><div class="cell-students"><span class="student-subtitle">非此時期</span></div></div>`;
  }
  const attendanceDate = getSelectedAttendanceDate();
  const seasonId = season?.id || getSeasonForDate(state, date)?.id || "summer-2026";
  const schedule = getSchedule(state, dateKey, slot, seasonId);
  const students = schedule?.studentIds
    .map((id) => getStudent(state, id))
    .filter((student) => student?.status === "active") || [];
  const temporaryStudentIds = new Set(schedule?.temporaryStudentIds || []);
  const displayedStudentIds = new Set(students.map((student) => student.id));
  const attendanceRecords = state.attendance.filter((item) => item.dateKey === dateKey && item.slot === slot);
  const presentStudentIds = new Set(attendanceRecords.map((item) => item.studentId));
  const leaveRecords = (state.leaveRecords || []).filter((item) => (
    item.dateKey === dateKey
    && item.slot === slot
    && displayedStudentIds.has(item.studentId)
  ));
  const leaveStudentIds = new Set(leaveRecords.map((item) => item.studentId));
  const attendedCount = attendanceRecords.length;
  const leaveCount = leaveRecords.length;
  const isAttendanceDate = dateKey === attendanceDate;
  const cellClass = `schedule-cell${isAttendanceDate ? " is-attendance-date" : ""}${attendedCount ? " has-attendance" : ""}`;
  const canAddStudents = !deletionMode
    && attendedCount === 0
    && isScheduleSlotUpcoming(dateKey, slot, now);
  const addButton = canAddStudents
    ? `<button class="schedule-add-students-button" data-action="add-schedule-students" data-date="${dateKey}" data-slot="${slot}" data-season="${escapeAttribute(seasonId)}" type="button" aria-label="新增 ${dateKey} ${slot} 的排課學生"><span class="schedule-add-students-icon" aria-hidden="true">＋</span><span class="schedule-add-students-label">新增學生</span></button>`
    : "";
  return `<div class="${cellClass}" data-date="${dateKey}" data-slot="${slot}" data-season="${seasonId}"${deletionMode ? "" : ` tabindex="0" role="button"`} aria-label="${dateKey} ${slot} 排課格"><div class="cell-count"><span>${students.length} 人</span><span class="cell-status-counts">${attendedCount ? `<span class="cell-attendance-count">已到 ${attendedCount}</span>` : ""}${leaveCount ? `<span class="cell-leave-count">請假 ${leaveCount}</span>` : ""}</span></div><div class="cell-students">${students.map((student) => renderScheduledStudent(student, { dateKey, slot, seasonId, isLocked: presentStudentIds.has(student.id), isOnLeave: leaveStudentIds.has(student.id), isTemporary: temporaryStudentIds.has(student.id) })).join("") || '<span class="student-subtitle">尚未排課</span>'}${addButton}</div></div>`;
}

function openScheduleStudentModal(app, state, {
  dateKey,
  slot,
  seasonId,
}, showToast) {
  const scheduledStudentIds = new Set(
    getSchedule(state, dateKey, slot, seasonId)?.studentIds || [],
  );
  const availableStudents = state.students
    .filter((student) => student.status === "active" && !scheduledStudentIds.has(student.id))
    .sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name, "zh-Hant"));
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const modal = document.createElement("section");
  modal.className = "modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "schedule-student-picker-title");
  modal.innerHTML = `<form class="modal-form" data-schedule-student-form><div class="modal-head"><div><h3 id="schedule-student-picker-title">新增排課學生</h3><p class="student-subtitle">${escapeHtml(`${dateKey}・${slot}`)}，建立一般排課並可沿用到後續週次。</p></div><button class="modal-close" type="button" data-close-modal>關閉</button></div><div class="field"><label for="schedule-student-search">搜尋學生</label><input class="input" id="schedule-student-search" type="search" autocomplete="off" placeholder="輸入學生姓名或年級" /></div><div class="checkbox-list schedule-student-picker-list" data-schedule-student-list>${availableStudents.map((student) => `<label class="checkbox-item schedule-student-picker-option" data-search-text="${escapeAttribute(`${student.name}${student.grade}`)}"><input type="checkbox" name="studentIds" value="${escapeAttribute(student.id)}" /><span><strong>${escapeHtml(student.name)}</strong><small>${student.grade} 年級・第 ${student.currentLessonCount} / 24 堂</small></span></label>`).join("")}</div><p class="panel empty schedule-student-picker-empty" data-schedule-student-empty ${availableStudents.length ? "hidden" : ""}>沒有可加入的學生。</p><div class="schedule-student-picker-selection" data-schedule-student-selection>已選取 0 位</div><div class="form-actions"><button class="button-secondary" type="button" data-cancel>取消</button><button class="button-primary" type="submit" disabled>加入排課</button></div></form>`;
  backdrop.append(modal);
  app.append(backdrop);

  const form = modal.querySelector("[data-schedule-student-form]");
  const search = modal.querySelector("#schedule-student-search");
  const options = [...modal.querySelectorAll(".schedule-student-picker-option")];
  const empty = modal.querySelector("[data-schedule-student-empty]");
  const selection = modal.querySelector("[data-schedule-student-selection]");
  const submitButton = form.querySelector('[type="submit"]');
  const close = () => backdrop.remove();
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
      const matches = !query
        || (option.dataset.searchText || "").toLocaleLowerCase().includes(query);
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
      const addedCount = await addScheduleEntries(studentIds, {
        dateKey,
        slot,
        seasonId,
      });
      close();
      showToast(addedCount
        ? `已新增 ${addedCount} 位學生到排課`
        : "選取的學生已在這個時段");
    } catch (error) {
      submitButton.disabled = false;
      showToast(getUserErrorMessage(error, "新增排課學生失敗"));
    }
  });
  search.focus();
}

export function bindSchedule(app, state, refresh, showToast) {
  const visibleSeason = getSelectedScheduleSeason(state);
  const ensureKey = `${visibleSeason?.id || ""}:${formatDate(scheduleWeekStart)}`;
  if (visibleSeason && ensureKey !== lastEnsuredWeekKey) {
    lastEnsuredWeekKey = ensureKey;
    const queuedWeekStart = getWeekStart(scheduleWeekStart);
    scheduleEnsureQueue = scheduleEnsureQueue
      .catch(() => undefined)
      .then(() => ensureScheduleWeek(queuedWeekStart, visibleSeason.id, {
        startDate: visibleSeason.startDate,
        endDate: visibleSeason.endDate,
      }))
      .catch((error) => {
        if (lastEnsuredWeekKey === ensureKey) lastEnsuredWeekKey = "";
        showToast(getUserErrorMessage(error, "無法沿用前一週排課"));
      });
  }
  const navigateToWeek = (targetWeekStart) => {
    const normalizedWeekStart = getWeekStart(targetWeekStart);
    const weekEnd = addDays(normalizedWeekStart, 5);
    if (visibleSeason
      && (formatDate(weekEnd) < visibleSeason.startDate
        || formatDate(normalizedWeekStart) > visibleSeason.endDate)) return;
    scheduleWeekStart = normalizedWeekStart;
    selectedMobileScheduleDateKey = "";
    refresh();
  };
  const switchSeason = (seasonId) => {
    const season = state.seasons.find((item) => item.id === seasonId);
    if (!season) return;
    selectedScheduleSeasonId = season.id;
    scheduleWeekStart = getWeekStart(getSeasonNavigationDate(season));
    selectedMobileScheduleDateKey = "";
    lastEnsuredWeekKey = "";
    refresh();
  };
  app.querySelectorAll('[data-action="switch-schedule-season"]').forEach((button) => {
    button.addEventListener("click", () => switchSeason(button.dataset.seasonId));
  });
  app.querySelector("#schedule-season-select")?.addEventListener("change", (event) => {
    switchSeason(event.target.value);
  });
  app.querySelectorAll('[data-action="select-mobile-schedule-date"]').forEach((button) => {
    button.addEventListener("click", () => {
      selectedMobileScheduleDateKey = button.dataset.date;
      refresh();
    });
  });
  app.querySelector('[data-action="prev-week"]')?.addEventListener("click", () => navigateToWeek(addDays(scheduleWeekStart, -7)));
  app.querySelector('[data-action="next-week"]')?.addEventListener("click", () => navigateToWeek(addDays(scheduleWeekStart, 7)));
  app.querySelector('[data-action="current-week"]')?.addEventListener("click", () => {
    const today = new Date();
    const currentSeason = sortedSeasons(state).find((season) => seasonContainsDate(season, today))
      || sortedSeasons(state).find((season) => season.active)
      || visibleSeason;
    if (!currentSeason) return;
    selectedScheduleSeasonId = currentSeason.id;
    scheduleWeekStart = getWeekStart(getSeasonNavigationDate(currentSeason, today));
    selectedMobileScheduleDateKey = "";
    lastEnsuredWeekKey = "";
    refresh();
  });
  app.querySelector('[data-action="toggle-delete-mode"]')?.addEventListener("click", () => {
    deletionMode = !deletionMode;
    refresh();
  });
  app.querySelectorAll('[data-action="toggle-palette"]').forEach((button) => button.addEventListener("click", () => { paletteCollapsed = !paletteCollapsed; refresh(); }));
  applyScheduleSearch(app);
  app.querySelector("#schedule-search")?.addEventListener("input", (event) => {
    scheduleSearch = event.target.value.trim();
    applyScheduleSearch(app);
  });
  app.querySelectorAll('[data-action="remove-schedule-student"]').forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await removeScheduleEntry(button.dataset.studentId, {
          dateKey: button.dataset.date,
          slot: button.dataset.slot,
          seasonId: button.dataset.season,
          ...(button.dataset.temporary === "true" ? { temporary: true } : {}),
        });
        showToast(button.dataset.temporary === "true"
          ? `已移除 ${button.dataset.studentName} 的臨時排課`
          : `已將 ${button.dataset.studentName} 從本週起移除`);
      } catch (error) {
        button.disabled = false;
        showToast(getUserErrorMessage(error, "無法移除排課"));
      }
    });
  });
  app.querySelectorAll('[data-action="add-schedule-students"]').forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const target = {
        dateKey: button.dataset.date,
        slot: button.dataset.slot,
        seasonId: button.dataset.season,
      };
      if (!isScheduleSlotUpcoming(target.dateKey, target.slot)
        || state.attendance.some((item) => (
          item.dateKey === target.dateKey && item.slot === target.slot
        ))) {
        showToast("這個時段已開始或已有點名紀錄，無法新增學生");
        refresh();
        return;
      }
      openScheduleStudentModal(app, state, target, showToast);
    });
  });

  if (deletionMode) return;

  let desktopDrag = null;
  let touchDrag = null;
  let keyboardDrag = null;
  const dragItems = [...app.querySelectorAll("[data-drag-student]:not(.is-locked)")];
  const cells = [...app.querySelectorAll(".schedule-cell:not(.is-outside-season)")];
  const getDragData = (item) => ({
    studentId: item.dataset.dragStudent,
    source: item.dataset.dragSource === "schedule"
      ? {
          date: item.dataset.sourceDate,
          slot: item.dataset.sourceSlot,
          season: item.dataset.sourceSeason,
          ...(item.dataset.sourceTemporary === "true" ? { temporary: true } : {}),
        }
      : null,
  });
  const drop = (data, cell) => {
    if (!cell || !data) return;
    const hasAttendanceOnDate = (date) => state.attendance.some((item) => item.studentId === data.studentId && item.dateKey === date);
    if (hasAttendanceOnDate(cell.dataset.date) || (data.source && hasAttendanceOnDate(data.source.date))) return;
    const source = data.source ? {
      dateKey: data.source.date,
      slot: data.source.slot,
      seasonId: data.source.season,
      ...(data.source.temporary ? { temporary: true } : {}),
    } : null;
    moveScheduleEntry(data.studentId, source, {
      dateKey: cell.dataset.date,
      slot: cell.dataset.slot,
      seasonId: cell.dataset.season,
    }).catch((error) => showToast(getUserErrorMessage(error, "排課更新失敗")));
  };
  const clearKeyboardDrag = () => {
    keyboardDrag = null;
    dragItems.forEach((item) => item.classList.remove("is-dragging"));
    cells.forEach((cell) => cell.classList.remove("is-drop-target"));
  };

  dragItems.forEach((item) => {
    item.addEventListener("dragstart", (event) => { desktopDrag = getDragData(item); item.classList.add("is-dragging"); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.dataset.dragStudent); });
    item.addEventListener("dragend", () => { desktopDrag = null; item.classList.remove("is-dragging"); cells.forEach((cell) => cell.classList.remove("is-drop-target")); });
    item.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "touch") return;
      event.preventDefault();
      touchDrag = { data: getDragData(item), item };
      item.classList.add("is-dragging");
      document.addEventListener("pointermove", onTouchMove, { passive: false });
      document.addEventListener("pointerup", onTouchEnd, { once: true });
    });
    item.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      clearKeyboardDrag();
      keyboardDrag = getDragData(item);
      item.classList.add("is-dragging");
      cells.forEach((cell) => cell.classList.add("is-drop-target"));
      showToast("已選取學生，請在目標排課格按 Enter");
    });
  });
  cells.forEach((cell) => {
    cell.addEventListener("dragover", (event) => { event.preventDefault(); cell.classList.add("is-drop-target"); });
    cell.addEventListener("dragleave", () => cell.classList.remove("is-drop-target"));
    cell.addEventListener("drop", (event) => { event.preventDefault(); cell.classList.remove("is-drop-target"); drop(desktopDrag, cell); });
    cell.addEventListener("keydown", (event) => {
      if (!keyboardDrag || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      const data = keyboardDrag;
      clearKeyboardDrag();
      drop(data, cell);
    });
  });

  function onTouchMove(event) {
    if (!touchDrag) return;
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".schedule-cell");
    cells.forEach((cell) => cell.classList.toggle("is-drop-target", cell === target));
  }

  function onTouchEnd(event) {
    if (!touchDrag) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".schedule-cell");
    touchDrag.item.classList.remove("is-dragging");
    document.removeEventListener("pointermove", onTouchMove);
    cells.forEach((cell) => cell.classList.remove("is-drop-target"));
    const data = touchDrag.data;
    touchDrag = null;
    drop(data, target);
  }
}
