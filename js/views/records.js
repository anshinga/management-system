import {
  getArchivePeriods,
  getBiMonthPeriod,
  getCurrentStudentRecords,
  getStudentRecordsForPeriod,
} from "../domain/records.js";
import { getTodayDate } from "../store.js";
import { escapeAttribute, escapeHtml } from "../ui/html.js";

function renderRecordItem(item) {
  const classes = [
    "record-item",
    item.type === "baseline" ? "is-baseline" : "",
    item.isCarryover ? "is-carryover" : "",
  ].filter(Boolean).join(" ");
  return `<div class="${classes}"><span class="record-date">${escapeHtml(item.dateKey)}</span><span class="record-lesson">第 ${item.term} 期・第 ${item.lessonNumber} 堂</span></div>`;
}

function renderStudentRows(students, getHistory, includeEmptyStudents = true) {
  const rows = students
    .map((student) => ({ student, history: getHistory(student) }))
    .filter(({ history }) => includeEmptyStudents || history.length)
    .map(({ student, history }) => `<div class="record-row"><div class="record-meta"><span class="grade-badge">${student.grade} 年級</span><strong>${escapeHtml(student.name)}</strong></div><div class="record-history">${history.length ? history.map(renderRecordItem).join("") : '<span class="student-subtitle">本期尚無點名紀錄</span>'}</div></div>`);
  return rows.length
    ? `<div class="record-list">${rows.join("")}</div>`
    : '<div class="panel empty">這個資料夾目前沒有紀錄。</div>';
}

function renderCurrentRecords(state, todayDate) {
  const period = getBiMonthPeriod(todayDate);
  const students = [...state.students].sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name));
  return `<div class="page-head"><div><p class="eyebrow">歷史出席</p><h2>紀錄</h2><p>目前顯示 ${period.label}，並保留每位學生此前最後一筆。</p></div><button class="button-secondary record-folder-button" data-action="open-record-folders" type="button">📁 資料夾</button></div>${renderStudentRows(
    students,
    (student) => getCurrentStudentRecords(student, state.attendance, todayDate),
  )}`;
}

function renderFolderList(state, todayDate) {
  const periods = getArchivePeriods(state.students, state.attendance, todayDate);
  return `<div class="page-head"><div><p class="eyebrow">歷史出席</p><h2>紀錄資料夾</h2><p>每兩個月自動分組，原始點名紀錄仍保留在原處。</p></div><button class="button-secondary" data-action="show-current-records" type="button">回到目前紀錄</button></div>${periods.length
    ? `<div class="record-folder-grid">${periods.map((period) => `<button class="record-folder" data-action="open-record-period" data-period-key="${escapeAttribute(period.key)}" type="button"><span class="record-folder-icon" aria-hidden="true">📁</span><span><strong>${escapeHtml(period.label)}</strong><small>${period.count} 筆紀錄</small></span></button>`).join("")}</div>`
    : '<div class="panel empty">目前還沒有可歸檔的前期紀錄。</div>'}`;
}

function renderArchivePeriod(state, periodKey) {
  const period = getBiMonthPeriod(`${periodKey}-01`);
  const students = [...state.students].sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name));
  return `<div class="page-head"><div><p class="eyebrow">紀錄資料夾</p><h2>${escapeHtml(period.label)}</h2><p>完整顯示這個雙月區間內的紀錄。</p></div><button class="button-secondary" data-action="open-record-folders" type="button">返回資料夾</button></div>${renderStudentRows(
    students,
    (student) => getStudentRecordsForPeriod(student, state.attendance, periodKey),
    false,
  )}`;
}

export function renderRecords(state, options = {}) {
  const todayDate = options.todayDate || getTodayDate();
  if (options.view === "folders") return renderFolderList(state, todayDate);
  if (options.view === "period" && options.periodKey) {
    return renderArchivePeriod(state, options.periodKey);
  }
  return renderCurrentRecords(state, todayDate);
}

export function bindRecords(app, state) {
  const navigate = (options) => {
    app.innerHTML = renderRecords(state, options);
    bindRecords(app, state);
  };
  app.querySelector('[data-action="open-record-folders"]')?.addEventListener("click", () => navigate({ view: "folders" }));
  app.querySelector('[data-action="show-current-records"]')?.addEventListener("click", () => navigate({ view: "current" }));
  app.querySelectorAll('[data-action="open-record-period"]').forEach((button) => {
    button.addEventListener("click", () => navigate({
      view: "period",
      periodKey: button.dataset.periodKey,
    }));
  });
}
