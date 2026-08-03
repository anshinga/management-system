import { getBackupTemplatePlacements } from "../domain/export-backup.js";

const DOCUMENT_PATH = "word/document.xml";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const TEXT_NODE_PATTERN = /<w:t\b([^>]*)>[\s\S]*?<\/w:t>/g;
const ROW_PATTERN = /<w:tr\b[\s\S]*?<\/w:tr>/g;
const CELL_PATTERN = /<w:tc\b[\s\S]*?<\/w:tc>/g;

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function replaceTextNodes(fragment, value) {
  let replaced = false;
  const result = fragment.replace(TEXT_NODE_PATTERN, (_, attributes) => {
    const text = replaced ? "" : escapeXml(value);
    replaced = true;
    return `<w:t${attributes}>${text}</w:t>`;
  });
  if (!replaced) throw new Error("Word 範本缺少可填入文字的位置。");
  return result;
}

function nameRunXml(value) {
  return `<w:r><w:rPr><w:rFonts w:ascii="Microsoft JhengHei" w:hAnsi="Microsoft JhengHei" w:eastAsia="微軟正黑體"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr><w:t>${escapeXml(value)}</w:t></w:r>`;
}

function replaceCellText(cellXml, value) {
  const paragraphPattern = /<w:p\b([^>]*)>([\s\S]*?)<\/w:p>/;
  const match = cellXml.match(paragraphPattern);
  if (!match) throw new Error("Word 範本的學生欄位格式不正確。");
  const paragraphContent = match[2].replace(/<w:r\b[\s\S]*?<\/w:r>/g, "");
  const paragraph = `<w:p${match[1]}>${paragraphContent}${nameRunXml(value)}</w:p>`;
  return cellXml.replace(paragraphPattern, paragraph);
}

function replaceIndexedFragments(source, pattern, replacements) {
  const matches = [...source.matchAll(pattern)];
  let cursor = 0;
  let output = "";
  matches.forEach((match, index) => {
    output += source.slice(cursor, match.index);
    output += replacements.has(index) ? replacements.get(index) : match[0];
    cursor = match.index + match[0].length;
  });
  return output + source.slice(cursor);
}

function renderHeaderRow(rowXml, model) {
  const cells = [...rowXml.matchAll(CELL_PATTERN)];
  if (cells.length !== 7) throw new Error("Word 範本的星期標題欄位數量不正確。");
  const replacements = new Map(model.days.map((day, index) => [
    index + 1,
    replaceTextNodes(cells[index + 1][0], day.header),
  ]));
  return replaceIndexedFragments(rowXml, CELL_PATTERN, replacements);
}

function renderBodyRow(rowXml, placements) {
  const cells = [...rowXml.matchAll(CELL_PATTERN)];
  if (cells.length !== 23) throw new Error("Word 範本的學生欄位數量不正確。");
  const replacements = new Map(placements.map((placement) => [
    placement.column,
    replaceCellText(cells[placement.column][0], placement.student.name),
  ]));
  return replaceIndexedFragments(rowXml, CELL_PATTERN, replacements);
}

function renderTable(tableXml, model, pageIndex) {
  const rows = [...tableXml.matchAll(ROW_PATTERN)];
  if (rows.length !== 19) throw new Error("Word 範本的表格列數不正確。");
  const placementsByRow = new Map();
  getBackupTemplatePlacements(model, pageIndex).forEach((placement) => {
    if (!placementsByRow.has(placement.row)) placementsByRow.set(placement.row, []);
    placementsByRow.get(placement.row).push(placement);
  });
  const replacements = new Map([[0, renderHeaderRow(rows[0][0], model)]]);
  placementsByRow.forEach((placements, rowIndex) => {
    replacements.set(rowIndex, renderBodyRow(rows[rowIndex][0], placements));
  });
  return replaceIndexedFragments(tableXml, ROW_PATTERN, replacements);
}

function findTemplateParts(templateXml) {
  const tableMatch = templateXml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/);
  const titleMatch = templateXml.match(/<w:body\b[^>]*>[\s\r\n]*(<w:p\b[\s\S]*?<\/w:p>)/);
  if (!tableMatch || !titleMatch) throw new Error("Word 範本缺少標題或課表。");
  const titleXml = titleMatch[1];
  const titleStart = templateXml.indexOf(titleXml);
  const tableStart = templateXml.indexOf(tableMatch[0], titleStart + titleXml.length);
  return {
    titleXml,
    tableXml: tableMatch[0],
    start: titleStart,
    end: tableStart + tableMatch[0].length,
  };
}

export function patchBackupDocumentXml(templateXml, model) {
  const parts = findTemplateParts(templateXml);
  const pageBreak = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  const pages = model.pages.map((page, pageIndex) => {
    const title = replaceTextNodes(parts.titleXml, page.title);
    const table = renderTable(parts.tableXml, model, pageIndex);
    return `${title}${table}`;
  }).join(pageBreak);
  return `${templateXml.slice(0, parts.start)}${pages}${templateXml.slice(parts.end)}`;
}

export async function generateBackupDocxBlob({
  model,
  templateUrl,
  fetchImpl = globalThis.fetch,
  JSZipClass = globalThis.JSZip,
}) {
  if (!JSZipClass?.loadAsync) throw new Error("Word 匯出元件尚未載入，請重新整理頁面後再試。");
  const response = await fetchImpl(templateUrl);
  if (!response.ok) throw new Error("無法讀取 Word 備份範本。");
  const zip = await JSZipClass.loadAsync(await response.arrayBuffer());
  const documentPart = zip.file(DOCUMENT_PATH);
  if (!documentPart) throw new Error("Word 備份範本缺少主要文件內容。");
  const templateXml = await documentPart.async("string");
  zip.file(DOCUMENT_PATH, patchBackupDocumentXml(templateXml, model), { createFolders: false });
  return zip.generateAsync({
    type: "blob",
    mimeType: DOCX_MIME,
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}
