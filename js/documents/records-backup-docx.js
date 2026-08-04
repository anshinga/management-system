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
  if (!replaced) throw new Error("課程紀錄 Word 範本缺少標題文字位置。");
  return result;
}

function cellRunXml(value, size) {
  return `<w:r><w:rPr><w:rFonts w:ascii="Microsoft JhengHei" w:hAnsi="Microsoft JhengHei" w:eastAsia="微軟正黑體"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t>${escapeXml(value)}</w:t></w:r>`;
}

function centeredParagraphXml(attributes, paragraphProperties, value, size) {
  const properties = paragraphProperties
    ? paragraphProperties.replace(/<w:jc\b[^>]*\/>/g, "").replace("</w:pPr>", '<w:jc w:val="center"/></w:pPr>')
    : '<w:pPr><w:jc w:val="center"/></w:pPr>';
  return `<w:p${attributes}>${properties}${cellRunXml(value, size)}</w:p>`;
}

function fitCellText(cellXml) {
  const cellProperties = cellXml.match(/<w:tcPr\b[\s\S]*?<\/w:tcPr>/)?.[0];
  if (cellProperties) {
    const fittedProperties = cellProperties
      .replace(/<w:noWrap\b[^>]*\/>/g, "")
      .replace(/<w:fitText\b[^>]*\/>/g, "")
      .replace("</w:tcPr>", '<w:noWrap/><w:fitText w:val="1"/></w:tcPr>');
    return cellXml.replace(cellProperties, fittedProperties);
  }

  const emptyCellProperties = cellXml.match(/<w:tcPr\b([^>]*)\/>/);
  if (!emptyCellProperties) return cellXml;
  const attributes = emptyCellProperties[1] || "";
  return cellXml.replace(
    emptyCellProperties[0],
    `<w:tcPr${attributes}><w:noWrap/><w:fitText w:val="1"/></w:tcPr>`
  );
}

function replaceCellText(cellXml, value, size) {
  const fittedCellXml = fitCellText(cellXml);
  const pairedParagraph = fittedCellXml.match(/<w:p\b([^>]*)>([\s\S]*?)<\/w:p>/);
  if (pairedParagraph) {
    const paragraphProperties = pairedParagraph[2].match(/<w:pPr\b[\s\S]*?<\/w:pPr>/)?.[0] || "";
    return fittedCellXml.replace(
      pairedParagraph[0],
      centeredParagraphXml(pairedParagraph[1], paragraphProperties, value, size),
    );
  }
  const emptyParagraph = fittedCellXml.match(/<w:p\b([^>]*)\/>/);
  if (!emptyParagraph) throw new Error("課程紀錄 Word 範本的表格欄位格式不正確。");
  return fittedCellXml.replace(
    emptyParagraph[0],
    centeredParagraphXml(emptyParagraph[1], "", value, size),
  );
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

function renderRecordRow(rowXml, row) {
  const cells = [...rowXml.matchAll(CELL_PATTERN)];
  if (cells.length !== 16) throw new Error("課程紀錄 Word 範本的欄位數量不正確。");
  const replacements = new Map();
  replacements.set(0, replaceCellText(cells[0][0], row.label, row.continuation ? 18 : 24));
  row.records.forEach((record, index) => {
    replacements.set(index + 1, replaceCellText(cells[index + 1][0], record.shortDate, 18));
  });
  return replaceIndexedFragments(rowXml, CELL_PATTERN, replacements);
}

function renderTable(tableXml, model) {
  const sourceRows = [...tableXml.matchAll(ROW_PATTERN)].map((match) => match[0]);
  if (sourceRows.length !== 67) throw new Error("課程紀錄 Word 範本的列數不正確。");
  const renderedRowCount = Math.max(66, model.rows.length);
  const rows = Array.from({ length: renderedRowCount }, (_, index) => {
    const rowXml = sourceRows[index] || sourceRows.at(-1);
    return model.rows[index] ? renderRecordRow(rowXml, model.rows[index]) : rowXml;
  }).join("");
  return tableXml.replace(ROW_PATTERN, "").replace("</w:tbl>", `${rows}</w:tbl>`);
}

function findTemplateParts(templateXml) {
  const tableMatch = templateXml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/);
  const titleMatch = templateXml.match(/<w:body\b[^>]*>[\s\r\n]*(<w:p\b[\s\S]*?<\/w:p>)/);
  if (!tableMatch || !titleMatch) throw new Error("課程紀錄 Word 範本缺少標題或表格。");
  const titleXml = titleMatch[1];
  const titleStart = templateXml.indexOf(titleXml);
  const tableStart = templateXml.indexOf(tableMatch[0], titleStart + titleXml.length);
  return {
    titleXml,
    tableXml: tableMatch[0],
    titleStart,
    tableStart,
    tableEnd: tableStart + tableMatch[0].length,
  };
}

function removeTrailingEmptyParagraph(suffix) {
  return suffix.replace(
    /^(\s*)<w:p\b[\s\S]*?<\/w:p>(?=\s*<w:sectPr\b)/,
    "$1",
  );
}

export function patchRecordsBackupDocumentXml(templateXml, model) {
  const parts = findTemplateParts(templateXml);
  const title = replaceTextNodes(parts.titleXml, model.title);
  const table = renderTable(parts.tableXml, model);
  const between = templateXml.slice(parts.titleStart + parts.titleXml.length, parts.tableStart);
  const suffix = removeTrailingEmptyParagraph(templateXml.slice(parts.tableEnd));
  return `${templateXml.slice(0, parts.titleStart)}${title}${between}${table}${suffix}`;
}

export async function generateRecordsBackupDocxBlob({
  model,
  templateUrl,
  fetchImpl = globalThis.fetch,
  JSZipClass = globalThis.JSZip,
}) {
  if (!JSZipClass?.loadAsync) throw new Error("Word 匯出元件尚未載入，請重新整理頁面後再試。");
  const response = await fetchImpl(templateUrl);
  if (!response.ok) throw new Error("無法讀取課程紀錄 Word 範本。");
  const zip = await JSZipClass.loadAsync(await response.arrayBuffer());
  const documentPart = zip.file(DOCUMENT_PATH);
  if (!documentPart) throw new Error("課程紀錄 Word 範本缺少主要文件內容。");
  const templateXml = await documentPart.async("string");
  zip.file(DOCUMENT_PATH, patchRecordsBackupDocumentXml(templateXml, model), { createFolders: false });
  return zip.generateAsync({
    type: "blob",
    mimeType: DOCX_MIME,
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}
