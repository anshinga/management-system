import {
  buildBackupExportModel,
  formatBackupFileName,
  getDefaultBackupWeekStart,
} from "../domain/export-backup.js";
import {
  buildRecordsBackupModel,
  formatRecordsBackupFileName,
  getRecordsBackupPeriods,
} from "../domain/records-backup.js";
import { generateBackupDocxBlob } from "../documents/backup-docx.js";
import { openBackupPrintDialog } from "../documents/backup-print.js";
import { generateRecordsBackupDocxBlob } from "../documents/records-backup-docx.js";
import { openRecordsBackupPrintDialog } from "../documents/records-backup-print.js";
import { addDays, formatDate, getTodayDate, parseDate } from "../store.js";
import { escapeAttribute, escapeHtml } from "../ui/html.js";

const WEEKLY_BACKUP_TEMPLATE_URL = new URL(
  "../../assets/templates/mpm-weekly-backup-template.docx",
  import.meta.url,
).href;
const RECORDS_BACKUP_TEMPLATE_URL = new URL(
  "../../assets/templates/mpm-records-backup-template.docx",
  import.meta.url,
).href;

let selectedBackupWeekStart = formatDate(getDefaultBackupWeekStart());
let selectedBackupKind = "weekly";
let selectedRecordsPeriodKey = "";

function renderBackupKindSwitch(kind) {
  return `<div class="export-backup-mode-switch" role="group" aria-label="備份類型"><button class="export-backup-mode${kind === "weekly" ? " is-active" : ""}" data-action="select-backup-kind" data-kind="weekly" type="button" aria-pressed="${kind === "weekly"}">下週點名表</button><button class="export-backup-mode${kind === "records" ? " is-active" : ""}" data-action="select-backup-kind" data-kind="records" type="button" aria-pressed="${kind === "records"}">課程紀錄表</button></div>`;
}

function renderSlot(slot) {
  return `<div class="export-backup-slot"><strong>${escapeHtml(slot.slot)}</strong><span>${slot.students.length ? slot.students.map((student) => escapeHtml(student.name)).join("、") : "—"}</span></div>`;
}

function renderDay(day) {
  return `<article class="export-backup-day"><header><strong>${escapeHtml(day.label)}</strong><span>${day.slots.reduce((total, slot) => total + slot.students.length, 0)} 人次</span></header><div>${day.slots.length ? day.slots.map(renderSlot).join("") : '<p class="export-backup-no-class">本日沒有營業時段</p>'}</div></article>`;
}

function renderExportNotes(model) {
  if (!model.totalOccurrences) {
    return '<p class="export-backup-notice">這一週目前沒有可匯出的在讀學生排課，仍可下載空白備份表。</p>';
  }
  if (model.pageCount > 1) {
    return `<p class="export-backup-notice is-warning">有時段超過單頁容量，將依原日期與原時段輸出為 ${model.pageCount} 頁，不會移動或省略學生。</p>`;
  }
  return '<p class="export-backup-notice">姓名右側會保留空白註記欄；匯出只讀取資料，不會修改排課。</p>';
}

function renderWeeklyExportBackup(state, options = {}) {
  const weekStart = options.weekStart || selectedBackupWeekStart;
  const model = buildBackupExportModel(state, weekStart);
  return `<div class="page-head export-backup-page-head"><div><p class="eyebrow">紙本備援</p><h2>匯出備份</h2><p>依排課資料產生一週點名表，提供 Word 與列印／另存 PDF。</p></div><div class="export-backup-actions"><button class="button-primary" data-action="download-backup-word" type="button">下載 Word</button><button class="button-secondary" data-action="print-backup" type="button">列印／另存 PDF</button></div></div>
    ${renderBackupKindSwitch("weekly")}
    <div class="week-toolbar export-backup-week-toolbar"><button class="button-secondary" data-action="prev-backup-week" type="button" aria-label="上一週">←</button><strong class="week-title">${escapeHtml(model.label)}</strong><button class="button-secondary" data-action="next-backup-week" type="button" aria-label="下一週">→</button><button class="button-secondary" data-action="default-backup-week" type="button">回到下一週</button></div>
    <section class="stat-grid export-backup-stats" aria-label="匯出摘要"><div class="stat"><span class="stat-label">學生</span><strong class="stat-value">${model.uniqueStudentCount}</strong><small class="stat-note">位在讀學生</small></div><div class="stat"><span class="stat-label">排課</span><strong class="stat-value">${model.totalOccurrences}</strong><small class="stat-note">人次</small></div><div class="stat"><span class="stat-label">輸出</span><strong class="stat-value">${model.pageCount}</strong><small class="stat-note">頁</small></div></section>
    ${renderExportNotes(model)}
    <section class="panel export-backup-preview" aria-labelledby="export-backup-preview-title"><div class="panel-head"><div><p class="eyebrow">匯出前預覽</p><h3 id="export-backup-preview-title">${escapeHtml(model.title)}</h3></div><span>${escapeHtml(model.weekStart)} 至 ${escapeHtml(model.weekEnd)}</span></div><div class="export-backup-day-grid">${model.days.map(renderDay).join("")}</div></section>`;
}

function renderRecordsPreviewRow(row) {
  const dates = row.records.length
    ? row.records.map((record) => `<span class="records-backup-date${record.isCarryover ? " is-carryover" : ""}"${record.isCarryover ? ' title="期間開始前最後一堂"' : ""}>${escapeHtml(record.cellText)}</span>`).join("")
    : '<span class="records-backup-empty">尚無課程紀錄</span>';
  return `<div class="records-backup-preview-row"><strong class="records-backup-student${row.continuation ? " is-continuation" : ""}">${escapeHtml(row.label)}</strong><div class="records-backup-dates">${dates}</div></div>`;
}

function renderRecordsExportNotes(model) {
  if (model.continuationRowCount) {
    return `<p class="export-backup-notice is-warning">有 ${model.continuationRowCount} 個續列；每列最多 15 堂，多出的紀錄會緊接在同一學生的「(續)」列，不會省略。</p>`;
  }
  return '<p class="export-backup-notice">只匯出在讀學生；每位學生會保留期間開始前最後一堂，再接上期間內全部課程。匯出只讀取資料，不會修改點名紀錄。</p>';
}

function renderRecordsExportBackup(state, options = {}) {
  const todayDate = options.todayDate || getTodayDate();
  const periods = getRecordsBackupPeriods(state, todayDate);
  const requestedPeriodKey = options.periodKey || selectedRecordsPeriodKey;
  const periodKey = periods.some(({ key }) => key === requestedPeriodKey)
    ? requestedPeriodKey
    : periods[0].key;
  const model = buildRecordsBackupModel(state, periodKey, todayDate);
  return `<div class="page-head export-backup-page-head"><div><p class="eyebrow">歷史備援</p><h2>匯出備份</h2><p>依已完成的點名紀錄產生雙月課程紀錄表，提供 Word 與列印／另存 PDF。</p></div><div class="export-backup-actions"><button class="button-primary" data-action="download-records-backup-word" type="button">下載 Word</button><button class="button-secondary" data-action="print-records-backup" type="button">列印／另存 PDF</button></div></div>
    ${renderBackupKindSwitch("records")}
    <div class="toolbar records-backup-toolbar"><label for="records-backup-period"><span>紀錄資料夾</span><select class="select" id="records-backup-period" data-action="select-records-backup-period">${periods.map((period) => `<option value="${escapeAttribute(period.key)}"${period.key === model.periodKey ? " selected" : ""}>${escapeHtml(period.label)}</option>`).join("")}</select></label></div>
    <section class="stat-grid export-backup-stats" aria-label="匯出摘要"><div class="stat"><span class="stat-label">學生</span><strong class="stat-value">${model.studentCount}</strong><small class="stat-note">位在讀學生</small></div><div class="stat"><span class="stat-label">本期課程</span><strong class="stat-value">${model.periodRecordCount}</strong><small class="stat-note">堂</small></div><div class="stat"><span class="stat-label">輸出</span><strong class="stat-value">${model.pageCount}</strong><small class="stat-note">頁</small></div></section>
    ${renderRecordsExportNotes(model)}
    <section class="panel export-backup-preview records-backup-preview" aria-labelledby="records-backup-preview-title"><div class="panel-head"><div><p class="eyebrow">匯出前預覽</p><h3 id="records-backup-preview-title">${escapeHtml(model.title)}</h3></div><span>${escapeHtml(model.startDate)} 至 ${escapeHtml(model.endDate)}</span></div><p class="records-backup-legend"><span class="records-backup-date is-carryover">前期最後一堂</span><span>虛線日期為期間開始前的銜接紀錄。</span></p><div class="records-backup-preview-list">${model.rows.map(renderRecordsPreviewRow).join("")}</div></section>`;
}

export function renderExportBackup(state, options = {}) {
  const kind = options.kind || selectedBackupKind;
  return kind === "records"
    ? renderRecordsExportBackup(state, options)
    : renderWeeklyExportBackup(state, options);
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function bindExportBackup(app, state, refresh, showToast) {
  app.querySelectorAll('[data-action="select-backup-kind"]').forEach((button) => {
    button.addEventListener("click", () => {
      selectedBackupKind = button.dataset.kind === "records" ? "records" : "weekly";
      refresh(true);
    });
  });

  const navigate = (days) => {
    selectedBackupWeekStart = formatDate(addDays(parseDate(selectedBackupWeekStart), days));
    refresh(true);
  };
  app.querySelector('[data-action="prev-backup-week"]')?.addEventListener("click", () => navigate(-7));
  app.querySelector('[data-action="next-backup-week"]')?.addEventListener("click", () => navigate(7));
  app.querySelector('[data-action="default-backup-week"]')?.addEventListener("click", () => {
    selectedBackupWeekStart = formatDate(getDefaultBackupWeekStart());
    refresh(true);
  });

  app.querySelector('[data-action="download-backup-word"]')?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = "正在產生…";
    try {
      const model = buildBackupExportModel(state, selectedBackupWeekStart);
      const blob = await generateBackupDocxBlob({
        model,
        templateUrl: WEEKLY_BACKUP_TEMPLATE_URL,
      });
      downloadBlob(blob, formatBackupFileName(model));
      showToast("Word 點名備份已下載");
    } catch (error) {
      console.error("Word 點名備份匯出失敗", error);
      showToast(error?.message || "無法產生 Word 點名備份");
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  });

  app.querySelector('[data-action="print-backup"]')?.addEventListener("click", () => {
    try {
      openBackupPrintDialog(buildBackupExportModel(state, selectedBackupWeekStart));
    } catch (error) {
      console.error("點名備份列印失敗", error);
      showToast(error?.message || "無法開啟列印視窗");
    }
  });

  app.querySelector('[data-action="select-records-backup-period"]')?.addEventListener("change", (event) => {
    selectedRecordsPeriodKey = event.currentTarget.value;
    refresh(true);
  });

  const currentRecordsModel = () => {
    const periodKey = app.querySelector('[data-action="select-records-backup-period"]')?.value;
    return buildRecordsBackupModel(state, periodKey);
  };

  app.querySelector('[data-action="download-records-backup-word"]')?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = "正在產生…";
    try {
      const model = currentRecordsModel();
      const blob = await generateRecordsBackupDocxBlob({
        model,
        templateUrl: RECORDS_BACKUP_TEMPLATE_URL,
      });
      downloadBlob(blob, formatRecordsBackupFileName(model));
      showToast("Word 課程紀錄備份已下載");
    } catch (error) {
      console.error("Word 課程紀錄備份匯出失敗", error);
      showToast(error?.message || "無法產生 Word 課程紀錄備份");
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  });

  app.querySelector('[data-action="print-records-backup"]')?.addEventListener("click", () => {
    try {
      openRecordsBackupPrintDialog(currentRecordsModel());
    } catch (error) {
      console.error("課程紀錄備份列印失敗", error);
      showToast(error?.message || "無法開啟課程紀錄列印視窗");
    }
  });
}
