import { getBackupPageCellStudents } from "../domain/export-backup.js";
import { escapeAttribute, escapeHtml } from "../ui/html.js";

const WEEKDAY_SLOT_ROWS = [
  { slot: "15:00", start: 1, end: 4, startLabel: "3:00", endLabel: "4:30" },
  { slot: "16:30", start: 5, end: 8, startLabel: "4:30", endLabel: "6:00" },
  { slot: "18:00", start: 9, end: 13, startLabel: "6:00", endLabel: "7:30" },
  { slot: "19:30", start: 14, end: 18, startLabel: "7:30", endLabel: "9:00" },
];

function weekdaySlotForRow(row) {
  return WEEKDAY_SLOT_ROWS.find(({ start, end }) => row >= start && row <= end);
}

function saturdaySlotForRow(row) {
  return row <= 8
    ? { slot: "09:00", start: 1 }
    : { slot: "10:30", start: 9 };
}

function renderNameCell(student, className = "") {
  return `<td class="backup-name ${className}">${student ? escapeHtml(student.name) : ""}</td><td class="backup-note"></td>`;
}

function renderBodyRow(model, pageIndex, row) {
  const slotInfo = weekdaySlotForRow(row);
  const rowIndex = row - slotInfo.start;
  const cells = [];
  if (row === slotInfo.start) {
    cells.push(`<th class="backup-time" rowspan="${slotInfo.end - slotInfo.start + 1}"><span>${slotInfo.startLabel}</span><span>${slotInfo.endLabel}</span></th>`);
  }
  model.days.slice(0, 5).forEach((day) => {
    const students = getBackupPageCellStudents(model, pageIndex, day.dateKey, slotInfo.slot);
    cells.push(renderNameCell(students[rowIndex * 2], "backup-day-start"));
    cells.push(renderNameCell(students[(rowIndex * 2) + 1]));
  });
  const saturday = model.days[5];
  const saturdaySlot = saturdaySlotForRow(row);
  const saturdayStudents = getBackupPageCellStudents(
    model,
    pageIndex,
    saturday.dateKey,
    saturdaySlot.slot,
  );
  cells.push(renderNameCell(saturdayStudents[row - saturdaySlot.start], "backup-day-start"));
  return `<tr class="${row === slotInfo.start ? "backup-slot-start" : ""}">${cells.join("")}</tr>`;
}

function renderPage(model, page, pageIndex) {
  return `<section class="backup-print-page">
    <h1>${escapeHtml(page.title)}</h1>
    <table aria-label="${escapeAttribute(`${model.label} 點名備份`)}">
      <thead><tr><th class="backup-corner"><span>星期</span><span>時間</span></th>${model.days.map((day) => `<th colspan="${day.weekdayIndex === 5 ? 2 : 4}">${escapeHtml(day.header)}</th>`).join("")}</tr></thead>
      <tbody>${Array.from({ length: 18 }, (_, index) => renderBodyRow(model, pageIndex, index + 1)).join("")}</tbody>
    </table>
  </section>`;
}

export function buildBackupPrintHtml(model) {
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="UTF-8" /><title>${escapeHtml(model.label)} 點名備份</title><style>
    @page { size: A4 landscape; margin: 7mm 8mm 10mm; }
    * { box-sizing: border-box; }
    html, body { background: #fff; color: #000; font-family: "Microsoft JhengHei", "Noto Sans TC", sans-serif; margin: 0; }
    .backup-print-page { break-after: page; height: 190mm; page-break-after: always; width: 100%; }
    .backup-print-page:last-child { break-after: auto; page-break-after: auto; }
    h1 { font-family: "Microsoft JhengHei", sans-serif; font-size: 24pt; font-weight: 400; line-height: 1; margin: 0 0 9mm; text-align: center; }
    table { border: 2.4px solid #000; border-collapse: collapse; table-layout: fixed; width: 100%; }
    th, td { border: 1px solid #000; height: 8.2mm; padding: 0.5mm; text-align: center; vertical-align: middle; }
    thead th { border: 2.4px solid #000; font-size: 18pt; font-weight: 400; height: 10mm; }
    .backup-corner { font-size: 10pt; padding: 0; position: relative; width: 14mm; }
    .backup-corner::after { background: #000; content: ""; height: 1px; left: 0; position: absolute; top: 50%; transform: rotate(34deg); transform-origin: left center; width: 17mm; }
    .backup-corner span:first-child { position: absolute; right: 1mm; top: 0.4mm; }
    .backup-corner span:last-child { bottom: 0.4mm; left: 1mm; position: absolute; }
    .backup-time { border: 2.4px solid #000; font-size: 16pt; font-weight: 400; padding: 0; width: 14mm; }
    .backup-time span { display: block; }
    .backup-time span:first-child { margin-bottom: 7mm; }
    .backup-name, .backup-note { font-size: 14pt; width: calc((100% - 14mm) / 22); }
    .backup-day-start { border-left-width: 2.4px; }
    .backup-slot-start > td { border-top-width: 2.4px; }
    @media screen { body { background: #eee; padding: 12px; } .backup-print-page { background: #fff; margin: 0 auto 12px; max-width: 297mm; padding: 7mm 8mm 10mm; } }
  </style></head><body>${model.pages.map((page, index) => renderPage(model, page, index)).join("")}</body></html>`;
}

export function openBackupPrintDialog(model, openWindow = (...args) => window.open(...args)) {
  const popup = openWindow("", "_blank");
  if (!popup) throw new Error("瀏覽器阻擋了列印視窗，請允許彈出式視窗後再試。");
  popup.document.open();
  popup.document.write(buildBackupPrintHtml(model));
  popup.document.close();
  popup.setTimeout(() => {
    popup.focus();
    popup.print();
  }, 0);
  return popup;
}
