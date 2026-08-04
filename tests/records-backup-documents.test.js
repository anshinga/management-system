import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { buildRecordsBackupModel } from "../js/domain/records-backup.js";
import { patchRecordsBackupDocumentXml } from "../js/documents/records-backup-docx.js";
import { buildRecordsBackupPrintHtml } from "../js/documents/records-backup-print.js";

function makeTemplateXml() {
  const cell = () => '<w:tc><w:tcPr/><w:p w:rsidR="1"/></w:tc>';
  const row = () => `<w:tr>${Array.from({ length: 16 }, cell).join("")}</w:tr>`;
  return `<w:document><w:body><w:p><w:r><w:t>/</w:t></w:r><w:r><w:t>/</w:t></w:r></w:p><w:tbl>${Array.from({ length: 67 }, row).join("")}</w:tbl><w:p><w:pPr/></w:p><w:sectPr/></w:body></w:document>`;
}

function makeAttendance(studentId, count) {
  return Array.from({ length: count }, (_, index) => ({
    studentId,
    dateKey: `2026-07-${String(index + 1).padStart(2, "0")}`,
    arrivalTime: "15:00",
    term: 1,
    lessonNumber: index + 1,
  }));
}

function makeModel(studentCount = 1, recordCount = 2) {
  const students = Array.from({ length: studentCount }, (_, index) => ({
    id: `s${index}`,
    name: index ? `學生${index}` : "安&明",
    grade: (index % 12) + 1,
    status: "active",
  }));
  return buildRecordsBackupModel({
    students,
    attendance: students.flatMap((student, index) => (
      index ? [] : makeAttendance(student.id, recordCount)
    )),
  }, "2026-07", "2026-08-03");
}

describe("records backup document output", () => {
  test("網站使用的 Word 範本與使用者提供的空白版型一致", async () => {
    const template = await readFile(new URL(
      "../assets/templates/mpm-records-backup-template.docx",
      import.meta.url,
    ));
    expect(createHash("sha256").update(template).digest("hex").toUpperCase())
      .toBe("A3E7C074C5DC7414894ED8C0DF7CDFC47E4B00AF16F7935E4948EAD6DFBAFDD3");
  });

  test("Word XML 填入期間、學生與一堂一格的日期並移除空白末頁段落", () => {
    const xml = patchRecordsBackupDocumentXml(makeTemplateXml(), makeModel());
    expect(xml).toContain("115 年 7–8 月課程紀錄");
    expect(xml).toContain("1.安&amp;明");
    expect(xml).toContain("7/1，1");
    expect(xml).toContain("7/2，2");
    expect(xml).toContain('<w:noWrap/><w:fitText w:val="1"/>');
    expect(xml.match(/<w:tr>/g)).toHaveLength(66);
    expect(xml).not.toContain("<w:p><w:pPr/></w:p><w:sectPr");
  });

  test("第 16 堂會寫入同一學生的續列", () => {
    const xml = patchRecordsBackupDocumentXml(makeTemplateXml(), makeModel(1, 16));
    expect(xml).toContain("1.安&amp;明(續)");
    expect(xml).toContain("7/16，16");
  });

  test("超過 67 個學生列時會複製表格列而不省略", () => {
    const model = makeModel(68, 0);
    const xml = patchRecordsBackupDocumentXml(makeTemplateXml(), model);
    expect(xml.match(/<w:tr>/g)).toHaveLength(68);
    expect(xml).toContain("學生67");
    expect(model.pageCount).toBe(4);
  });

  test("列印版維持十五個日期欄、三頁基本表格與續頁", () => {
    const html = buildRecordsBackupPrintHtml(makeModel(1, 16));
    expect(html.match(/class="records-print-page/g)).toHaveLength(3);
    expect(html).toContain("115 年 7–8 月課程紀錄");
    expect(html).toContain("1.安&amp;明(續)");
    expect(html).toContain("7/16，16");
    expect(html).toContain("@page { size: A4 landscape;");
    expect(html.match(/<col style=/g)).toHaveLength(16 * 3);
  });
});
