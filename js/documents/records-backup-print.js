import {
  RECORDS_BACKUP_TEMPLATE_ROWS,
} from "../domain/records-backup.js";
import { escapeAttribute, escapeHtml } from "../ui/html.js";

const FIRST_PAGE_ROWS = 21;
const CONTINUATION_PAGE_ROWS = 23;
const COLUMN_WIDTHS_MM = [
  24.57,
  16.97,
  16.97,
  17.02,
  16.97,
  17.02,
  17.07,
  17.02,
  17.02,
  17.07,
  17.02,
  17.02,
  17.07,
  17.02,
  17.02,
  9.03,
];

function paginateRows(model) {
  const rows = [
    ...model.rows,
    ...Array.from(
      { length: Math.max(0, RECORDS_BACKUP_TEMPLATE_ROWS - model.rows.length) },
      () => null,
    ),
  ];
  const pages = [rows.slice(0, FIRST_PAGE_ROWS)];
  for (let index = FIRST_PAGE_ROWS; index < rows.length; index += CONTINUATION_PAGE_ROWS) {
    pages.push(rows.slice(index, index + CONTINUATION_PAGE_ROWS));
  }
  return pages;
}

function renderRow(row) {
  const dates = row?.records || [];
  return `<tr><th class="records-student${row?.continuation ? " is-continuation" : ""}">${row ? escapeHtml(row.label) : ""}</th>${Array.from({ length: 15 }, (_, index) => `<td>${dates[index] ? escapeHtml(dates[index].cellText) : ""}</td>`).join("")}</tr>`;
}

function renderPage(model, rows, pageIndex) {
  return `<section class="records-print-page${pageIndex ? " is-continuation-page" : ""}">
    ${pageIndex ? "" : `<h1>${escapeHtml(model.title)}</h1>`}
    <table aria-label="${escapeAttribute(`${model.periodLabel} 課程紀錄備份`)}">
      <colgroup>${COLUMN_WIDTHS_MM.map((width) => `<col style="width:${width}mm" />`).join("")}</colgroup>
      <tbody>${rows.map(renderRow).join("")}</tbody>
    </table>
  </section>`;
}

export function buildRecordsBackupPrintHtml(model) {
  const pages = paginateRows(model);
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="UTF-8" /><title>${escapeHtml(model.periodLabel)} 課程紀錄備份</title><style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    html, body { background: #fff; color: #000; font-family: "Microsoft JhengHei", "Noto Sans TC", sans-serif; margin: 0; }
    .records-print-page { break-after: page; page-break-after: always; width: 100%; }
    .records-print-page:last-child { break-after: auto; page-break-after: auto; }
    h1 { font-size: 18pt; font-weight: 400; line-height: 1; margin: 0 0 5mm; text-align: center; }
    table { border-collapse: collapse; table-layout: fixed; width: 100%; }
    th, td { border: 1px solid #000; font-size: 8pt; font-weight: 400; height: 8mm; line-height: 1; overflow: hidden; padding: 0.4mm; text-align: center; vertical-align: middle; white-space: nowrap; }
    .records-student { font-size: 12pt; }
    .records-student.is-continuation { font-size: 9pt; }
    @media screen { body { background: #eee; padding: 12px; } .records-print-page { background: #fff; margin: 0 auto 12px; max-width: 297mm; min-height: 210mm; padding: 10mm; } }
  </style></head><body>${pages.map((rows, index) => renderPage(model, rows, index)).join("")}</body></html>`;
}

export function openRecordsBackupPrintDialog(
  model,
  openWindow = (...args) => window.open(...args),
) {
  const popup = openWindow("", "_blank");
  if (!popup) throw new Error("瀏覽器阻擋了列印視窗，請允許彈出式視窗後再試。");
  popup.document.open();
  popup.document.write(buildRecordsBackupPrintHtml(model));
  popup.document.close();
  popup.setTimeout(() => {
    popup.focus();
    popup.print();
  }, 0);
  return popup;
}
