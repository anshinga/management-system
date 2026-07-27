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
  ensureScheduleWeek,
  moveScheduleEntry,
  removeScheduleEntry,
} from "../repositories/schedule-repository.js";
import { escapeAttribute, escapeHtml } from "../ui/html.js";
import { getUserErrorMessage } from "../ui/errors.js";

const weekdays = ["週一", "週二", "週三", "週四", "週五", "週六"];
let scheduleWeekStart = getWeekStart(new Date());
let scheduleSearch = "";
let paletteCollapsed = false;
let deletionMode = false;
let observedAttendanceDate = null;
let lastEnsuredWeekKey = "";
let scheduleEnsureQueue = Promise.resolve();

function shortDate(date) { return `${date.getMonth() + 1}/${date.getDate()}`; }

function fullDate(date) {
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

export function renderSchedule(state) {
  const attendanceDate = getSelectedAttendanceDate();
  if (observedAttendanceDate !== attendanceDate) {
    scheduleWeekStart = getWeekStart(parseDate(attendanceDate));
    observedAttendanceDate = attendanceDate;
  }
  scheduleWeekStart = getWeekStart(scheduleWeekStart);
  const weekDates = getWeekDates(scheduleWeekStart);
  const season = getSeasonForDate(state, weekDates[0]);
  const activeStudents = [...state.students].filter((student) => student.status === "active").sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name, "zh-Hant"));
  const filteredStudents = activeStudents.filter((student) => !scheduleSearch || `${student.name}${student.grade}`.includes(scheduleSearch));
  const groupedStudents = [...new Set(filteredStudents.map((student) => student.grade))].sort((a, b) => a - b).map((grade) => ({ grade, students: filteredStudents.filter((student) => student.grade === grade) }));

  return `<div class="page-head"><div><p class="eyebrow">${escapeHtml(season?.name || "目前時段")}</p><h2>排課</h2><p>每週獨立保存日期，下一週首次開啟時會沿用前一週排課。<br>目前顯示 ${attendanceDate} 的到班標示${deletionMode ? '<br><span class="delete-mode-hint">刪除模式：點選學生卡片上的 ×，將從本週起移除。</span>' : ""}</p></div><button class="button-secondary schedule-edit-button${deletionMode ? " is-active" : ""}" data-action="toggle-delete-mode" type="button" aria-pressed="${deletionMode}"><span aria-hidden="true">${deletionMode ? "✓" : "✎"}</span> ${deletionMode ? "完成" : "修改排課"}</button></div>
    <div class="week-toolbar"><button class="round-button" data-action="prev-week" type="button" aria-label="上一週">‹</button><div class="week-title"><strong>${shortDate(weekDates[0])} ${weekdays[0]} — ${shortDate(weekDates[5])} ${weekdays[5]}</strong><span>${fullDate(weekDates[0])} 至 ${fullDate(weekDates[5])}</span></div><button class="round-button" data-action="next-week" type="button" aria-label="下一週">›</button><button class="button-secondary" data-action="current-week" type="button">回到本週</button></div>
    <div class="schedule-editor${paletteCollapsed ? " palette-collapsed" : ""}${deletionMode ? " is-delete-mode" : ""}"><aside class="student-palette"><div class="palette-head"><h3>學生</h3><div class="palette-tools"><span>${filteredStudents.length} / ${activeStudents.length} 位</span><button class="collapse-button" data-action="toggle-palette" type="button">收起</button></div></div><input class="input" id="schedule-search" value="${escapeAttribute(scheduleSearch)}" placeholder="搜尋姓名或年級" /><p class="drag-hint">${deletionMode ? "完成刪除編輯後，即可繼續拖曳新增或移動學生。" : "按住學生卡片，拖到右側日期與時間格。"}</p><div class="palette-groups">${groupedStudents.length ? groupedStudents.map(({ grade, students }) => `<section class="palette-group"><h4>${grade} 年級</h4><div class="palette-list">${students.map(renderPaletteStudent).join("")}</div></section>`).join("") : '<div class="empty">找不到學生。</div>'}</div></aside><section class="panel schedule-board"><div class="collapsed-palette-bar"><button class="button-secondary" data-action="toggle-palette" type="button">展開學生名單</button></div><div class="schedule-wrap"><div class="schedule-grid"><div class="schedule-label">時間</div>${weekDates.map((date, index) => `<div class="schedule-day"><strong>${shortDate(date)} ${weekdays[index]}</strong></div>`).join("")}${SCHEDULE_SLOTS.map((slot) => `<div class="schedule-label">${slot}</div>${weekDates.map((date) => renderCell(state, date, slot)).join("")}`).join("")}</div></div></section></div>`;
}

function renderPaletteStudent(student) {
  const interactiveAttributes = deletionMode
    ? 'draggable="false" aria-disabled="true"'
    : `draggable="true" tabindex="0" role="button" aria-label="選取 ${escapeAttribute(student.name)} 進行排課"`;
  return `<div class="drag-student palette-student" ${interactiveAttributes} data-drag-student="${escapeAttribute(student.id)}" data-drag-source="palette"><span>${escapeHtml(student.name)}</span></div>`;
}

function renderScheduledStudent(student, {
  dateKey,
  slot,
  seasonId,
  isAttendanceDate,
  isLocked,
}) {
  const studentClass = `drag-student schedule-student${isAttendanceDate && isLocked ? " is-present" : ""}${isLocked ? " is-locked" : ""}${deletionMode && !isLocked ? " is-delete-candidate" : ""}`;
  const sourceAttributes = `data-drag-student="${escapeAttribute(student.id)}" data-drag-source="schedule" data-source-date="${dateKey}" data-source-slot="${slot}" data-source-season="${escapeAttribute(seasonId)}"`;

  if (deletionMode) {
    const lockedAttributes = isLocked
      ? 'aria-disabled="true" title="已有點名紀錄，無法移除排課"'
      : 'title="從本週起移除這位學生"';
    const removeButton = isLocked ? "" : `<button class="schedule-remove-button" data-action="remove-schedule-student" data-student-id="${escapeAttribute(student.id)}" data-student-name="${escapeAttribute(student.name)}" data-date="${dateKey}" data-slot="${slot}" data-season="${escapeAttribute(seasonId)}" type="button" aria-label="從 ${dateKey} ${slot} 起移除 ${escapeAttribute(student.name)}">×</button>`;
    return `<div class="${studentClass}" ${lockedAttributes} ${sourceAttributes}><span>${escapeHtml(student.name)}</span>${removeButton}</div>`;
  }

  const dragAttributes = isLocked
    ? 'aria-disabled="true" title="已簽到，無法調整排課"'
    : `draggable="true" tabindex="0" role="button" aria-label="選取 ${escapeAttribute(student.name)} 以調整排課" title="拖曳或按 Enter 調整時間"`;
  return `<div class="${studentClass}" ${dragAttributes} ${sourceAttributes}><span>${escapeHtml(student.name)}</span></div>`;
}

function renderCell(state, date, slot) {
  const dateKey = formatDate(date);
  const attendanceDate = getSelectedAttendanceDate();
  const seasonId = getSeasonForDate(state, date)?.id || "summer-2026";
  const schedule = getSchedule(state, dateKey, slot, seasonId);
  const students = schedule?.studentIds.map((id) => getStudent(state, id)).filter(Boolean) || [];
  const attendanceRecords = state.attendance.filter((item) => item.dateKey === dateKey && item.slot === slot);
  const presentStudentIds = new Set(attendanceRecords.map((item) => item.studentId));
  const attendedCount = students.filter((student) => presentStudentIds.has(student.id)).length;
  const isAttendanceDate = dateKey === attendanceDate;
  const cellClass = `schedule-cell${isAttendanceDate ? " is-attendance-date" : ""}${isAttendanceDate && attendedCount ? " has-attendance" : ""}`;
  return `<div class="${cellClass}" data-date="${dateKey}" data-slot="${slot}" data-season="${seasonId}"${deletionMode ? "" : ` tabindex="0" role="button"`} aria-label="${dateKey} ${slot} 排課格"><div class="cell-count"><span>${students.length} 人</span>${isAttendanceDate ? `<span class="cell-attendance-count">已到 ${attendedCount}</span>` : ""}</div><div class="cell-students">${students.map((student) => renderScheduledStudent(student, { dateKey, slot, seasonId, isAttendanceDate, isLocked: presentStudentIds.has(student.id) })).join("") || '<span class="student-subtitle">尚未排課</span>'}</div></div>`;
}

export function bindSchedule(app, state, refresh, showToast) {
  const visibleSeason = getSeasonForDate(state, scheduleWeekStart);
  const ensureKey = `${visibleSeason?.id || ""}:${formatDate(scheduleWeekStart)}`;
  if (visibleSeason && ensureKey !== lastEnsuredWeekKey) {
    lastEnsuredWeekKey = ensureKey;
    const queuedWeekStart = getWeekStart(scheduleWeekStart);
    scheduleEnsureQueue = scheduleEnsureQueue
      .catch(() => undefined)
      .then(() => ensureScheduleWeek(queuedWeekStart, visibleSeason.id))
      .catch((error) => {
        if (lastEnsuredWeekKey === ensureKey) lastEnsuredWeekKey = "";
        showToast(getUserErrorMessage(error, "無法沿用前一週排課"));
      });
  }
  const navigateToWeek = (targetWeekStart) => {
    scheduleWeekStart = getWeekStart(targetWeekStart);
    refresh();
  };
  app.querySelector('[data-action="prev-week"]')?.addEventListener("click", () => navigateToWeek(addDays(scheduleWeekStart, -7)));
  app.querySelector('[data-action="next-week"]')?.addEventListener("click", () => navigateToWeek(addDays(scheduleWeekStart, 7)));
  app.querySelector('[data-action="current-week"]')?.addEventListener("click", () => navigateToWeek(getWeekStart(new Date())));
  app.querySelector('[data-action="toggle-delete-mode"]')?.addEventListener("click", () => {
    deletionMode = !deletionMode;
    refresh();
  });
  app.querySelectorAll('[data-action="toggle-palette"]').forEach((button) => button.addEventListener("click", () => { paletteCollapsed = !paletteCollapsed; refresh(); }));
  app.querySelector("#schedule-search")?.addEventListener("input", (event) => {
    const cursor = event.target.selectionStart;
    scheduleSearch = event.target.value.trim();
    refresh();
    requestAnimationFrame(() => {
      const nextInput = app.querySelector("#schedule-search");
      if (nextInput) { nextInput.focus(); nextInput.setSelectionRange(cursor, cursor); }
    });
  });
  app.querySelectorAll('[data-action="remove-schedule-student"]').forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await removeScheduleEntry(button.dataset.studentId, {
          dateKey: button.dataset.date,
          slot: button.dataset.slot,
          seasonId: button.dataset.season,
        });
        showToast(`已將 ${button.dataset.studentName} 從本週起移除`);
      } catch (error) {
        button.disabled = false;
        showToast(getUserErrorMessage(error, "無法移除排課"));
      }
    });
  });

  if (deletionMode) return;

  let desktopDrag = null;
  let touchDrag = null;
  let keyboardDrag = null;
  const dragItems = [...app.querySelectorAll("[data-drag-student]:not(.is-locked)")];
  const cells = [...app.querySelectorAll(".schedule-cell")];
  const getDragData = (item) => ({
    studentId: item.dataset.dragStudent,
    source: item.dataset.dragSource === "schedule" ? { date: item.dataset.sourceDate, slot: item.dataset.sourceSlot, season: item.dataset.sourceSeason } : null,
  });
  const drop = (data, cell) => {
    if (!cell || !data) return;
    const hasAttendanceOnDate = (date) => state.attendance.some((item) => item.studentId === data.studentId && item.dateKey === date);
    if (hasAttendanceOnDate(cell.dataset.date) || (data.source && hasAttendanceOnDate(data.source.date))) return;
    const source = data.source ? {
      dateKey: data.source.date,
      slot: data.source.slot,
      seasonId: data.source.season,
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
