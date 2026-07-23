import {
  addDays,
  ensureWeek,
  formatDate,
  getSchedule,
  getStudent,
  getWeekDates,
  getWeekStart,
  moveStudent,
  saveState,
} from "../store.js";

const slots = ["15:00", "16:30", "18:00", "19:00", "19:30", "21:00"];
const weekdays = ["週一", "週二", "週三", "週四", "週五", "週六"];
let scheduleWeekStart = getWeekStart(new Date());
let scheduleSearch = "";

function shortDate(date) { return `${date.getMonth() + 1}/${date.getDate()}`; }

function fullDate(date) {
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

export function renderSchedule(state) {
  scheduleWeekStart = getWeekStart(scheduleWeekStart);
  if (ensureWeek(state, scheduleWeekStart)) saveState(state);
  const weekDates = getWeekDates(scheduleWeekStart);
  const season = state.seasons.find((item) => item.active) || state.seasons[0];
  const activeStudents = [...state.students].filter((student) => student.status === "active").sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name, "zh-Hant"));
  const filteredStudents = activeStudents.filter((student) => !scheduleSearch || `${student.name}${student.grade}`.includes(scheduleSearch));
  const groupedStudents = [...new Set(filteredStudents.map((student) => student.grade))].sort((a, b) => a - b).map((grade) => ({ grade, students: filteredStudents.filter((student) => student.grade === grade) }));

  return `<div class="page-head"><div><p class="eyebrow">${season?.name || "目前時段"}</p><h2>排課</h2><p>每週獨立保存日期，下一週首次開啟時會沿用前一週排課。</p></div><span class="status-badge active">可拖曳編輯</span></div>
    <div class="week-toolbar"><button class="round-button" data-action="prev-week" type="button" aria-label="上一週">‹</button><div class="week-title"><strong>${fullDate(weekDates[0])} — ${fullDate(weekDates[5])}</strong><span>${formatDate(weekDates[0])} 至 ${formatDate(weekDates[5])}</span></div><button class="round-button" data-action="next-week" type="button" aria-label="下一週">›</button><button class="button-secondary" data-action="current-week" type="button">回到本週</button></div>
    <div class="schedule-editor"><aside class="student-palette"><div class="palette-head"><h3>學生</h3><span>${filteredStudents.length} / ${activeStudents.length} 位</span></div><input class="input" id="schedule-search" value="${scheduleSearch}" placeholder="搜尋姓名或年級" /><p class="drag-hint">按住學生卡片，拖到右側日期與時間格。</p><div class="palette-groups">${groupedStudents.length ? groupedStudents.map(({ grade, students }) => `<section class="palette-group"><h4>${grade} 年級</h4><div class="palette-list">${students.map(renderPaletteStudent).join("")}</div></section>`).join("") : '<div class="empty">找不到學生。</div>'}</div></aside><section class="panel schedule-board"><div class="schedule-wrap"><div class="schedule-grid"><div class="schedule-label">時間</div>${weekDates.map((date, index) => `<div class="schedule-day"><strong>${weekdays[index]}</strong><span>${shortDate(date)}</span></div>`).join("")}${slots.map((slot) => `<div class="schedule-label">${slot}</div>${weekDates.map((date) => renderCell(state, date, slot)).join("")}`).join("")}</div></div></section></div>`;
}

function renderPaletteStudent(student) {
  return `<div class="drag-student palette-student" draggable="true" data-drag-student="${student.id}" data-drag-source="palette" tabindex="0"><span class="grade-badge">${student.grade}</span><span>${student.name}</span></div>`;
}

function renderCell(state, date, slot) {
  const dateKey = formatDate(date);
  const schedule = getSchedule(state, dateKey, slot);
  const students = schedule?.studentIds.map((id) => getStudent(state, id)).filter(Boolean) || [];
  return `<div class="schedule-cell" data-date="${dateKey}" data-slot="${slot}"><div class="cell-count">${students.length} 人</div><div class="cell-students">${students.map((student) => `<div class="drag-student schedule-student" draggable="true" data-drag-student="${student.id}" data-drag-source="schedule" data-source-date="${dateKey}" data-source-slot="${slot}" title="拖曳以調整時間"><span>${student.name}</span><small>${student.grade}年級</small></div>`).join("") || '<span class="student-subtitle">尚未排課</span>'}</div></div>`;
}

export function bindSchedule(app, state, refresh) {
  app.querySelector('[data-action="prev-week"]')?.addEventListener("click", () => { scheduleWeekStart = addDays(scheduleWeekStart, -7); refresh(); });
  app.querySelector('[data-action="next-week"]')?.addEventListener("click", () => { scheduleWeekStart = addDays(scheduleWeekStart, 7); refresh(); });
  app.querySelector('[data-action="current-week"]')?.addEventListener("click", () => { scheduleWeekStart = getWeekStart(new Date()); refresh(); });
  app.querySelector("#schedule-search")?.addEventListener("input", (event) => {
    const cursor = event.target.selectionStart;
    scheduleSearch = event.target.value.trim();
    refresh();
    requestAnimationFrame(() => {
      const nextInput = app.querySelector("#schedule-search");
      if (nextInput) { nextInput.focus(); nextInput.setSelectionRange(cursor, cursor); }
    });
  });

  let desktopDrag = null;
  let touchDrag = null;
  const dragItems = [...app.querySelectorAll("[data-drag-student]")];
  const cells = [...app.querySelectorAll(".schedule-cell")];
  const getDragData = (item) => ({
    studentId: item.dataset.dragStudent,
    source: item.dataset.dragSource === "schedule" ? { date: item.dataset.sourceDate, slot: item.dataset.sourceSlot } : null,
  });
  const drop = (data, cell) => {
    if (!cell || !data) return;
    moveStudent(state, data.studentId, data.source, { date: cell.dataset.date, slot: cell.dataset.slot });
    refresh();
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
  });
  cells.forEach((cell) => {
    cell.addEventListener("dragover", (event) => { event.preventDefault(); cell.classList.add("is-drop-target"); });
    cell.addEventListener("dragleave", () => cell.classList.remove("is-drop-target"));
    cell.addEventListener("drop", (event) => { event.preventDefault(); cell.classList.remove("is-drop-target"); drop(desktopDrag, cell); });
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
