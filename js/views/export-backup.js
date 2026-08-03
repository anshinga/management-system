import {
  buildBackupExportModel,
  formatBackupFileName,
  getDefaultBackupWeekStart,
} from "../domain/export-backup.js";
import { generateBackupDocxBlob } from "../documents/backup-docx.js";
import { openBackupPrintDialog } from "../documents/backup-print.js";
import { addDays, formatDate, parseDate } from "../store.js";
import { escapeHtml } from "../ui/html.js";

const BACKUP_TEMPLATE_URL = new URL(
  "../../assets/templates/mpm-weekly-backup-template.docx",
  import.meta.url,
).href;

let selectedBackupWeekStart = formatDate(getDefaultBackupWeekStart());

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

export function renderExportBackup(state, options = {}) {
  const weekStart = options.weekStart || selectedBackupWeekStart;
  const model = buildBackupExportModel(state, weekStart);
  return `<div class="page-head export-backup-page-head"><div><p class="eyebrow">紙本備援</p><h2>匯出備份</h2><p>依排課資料產生一週點名表，提供 Word 與列印／另存 PDF。</p></div><div class="export-backup-actions"><button class="button-primary" data-action="download-backup-word" type="button">下載 Word</button><button class="button-secondary" data-action="print-backup" type="button">列印／另存 PDF</button></div></div>
    <div class="week-toolbar export-backup-week-toolbar"><button class="button-secondary" data-action="prev-backup-week" type="button" aria-label="上一週">←</button><strong class="week-title">${escapeHtml(model.label)}</strong><button class="button-secondary" data-action="next-backup-week" type="button" aria-label="下一週">→</button><button class="button-secondary" data-action="default-backup-week" type="button">回到下一週</button></div>
    <section class="stat-grid export-backup-stats" aria-label="匯出摘要"><div class="stat"><span class="stat-label">學生</span><strong class="stat-value">${model.uniqueStudentCount}</strong><small class="stat-note">位在讀學生</small></div><div class="stat"><span class="stat-label">排課</span><strong class="stat-value">${model.totalOccurrences}</strong><small class="stat-note">人次</small></div><div class="stat"><span class="stat-label">輸出</span><strong class="stat-value">${model.pageCount}</strong><small class="stat-note">頁</small></div></section>
    ${renderExportNotes(model)}
    <section class="panel export-backup-preview" aria-labelledby="export-backup-preview-title"><div class="panel-head"><div><p class="eyebrow">匯出前預覽</p><h3 id="export-backup-preview-title">${escapeHtml(model.title)}</h3></div><span>${escapeHtml(model.weekStart)} 至 ${escapeHtml(model.weekEnd)}</span></div><div class="export-backup-day-grid">${model.days.map(renderDay).join("")}</div></section>`;
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
        templateUrl: BACKUP_TEMPLATE_URL,
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
}
