import { describe, expect, test } from "vitest";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { buildBackupExportModel } from "../js/domain/export-backup.js";
import { patchBackupDocumentXml } from "../js/documents/backup-docx.js";
import { buildBackupPrintHtml } from "../js/documents/backup-print.js";

function makeTemplateXml() {
  const cell = (text = "") => `<w:tc><w:tcPr/><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`;
  const header = `<w:tr>${Array.from({ length: 7 }, (_, index) => cell(index ? `${index}` : "星期時間")).join("")}</w:tr>`;
  const body = Array.from({ length: 18 }, () => (
    `<w:tr>${Array.from({ length: 23 }, () => cell()).join("")}</w:tr>`
  )).join("");
  return `<w:document><w:body><w:p><w:r><w:t>MPM 月上課時間表</w:t></w:r></w:p><w:tbl>${header}${body}</w:tbl><w:sectPr/></w:body></w:document>`;
}

function makeModel(studentCount = 1, name = "安安") {
  const students = Array.from({ length: studentCount }, (_, index) => ({
    id: `s${index}`,
    name: index ? `學生${index}` : name,
    grade: index + 1,
    status: "active",
  }));
  return buildBackupExportModel({
    students,
    seasons: [{
      id: "summer-2026",
      name: "2026 暑假",
      startDate: "2026-07-01",
      endDate: "2026-08-31",
    }],
    scheduleEntries: students.map((student) => ({
      studentId: student.id,
      seasonId: "summer-2026",
      dateKey: "2026-08-03",
      slot: "15:00",
    })),
    scheduleOverrides: [],
  }, "2026-08-03");
}

describe("backup document output", () => {
  test("網站使用的 Word 範本與使用者提供的空白版型一致", async () => {
    const template = await readFile(new URL(
      "../assets/templates/mpm-weekly-backup-template.docx",
      import.meta.url,
    ));
    expect(createHash("sha256").update(template).digest("hex").toUpperCase())
      .toBe("245E770A0DF74E05B7DD8D801FEC70B220788D43E1CDFAAC3642D50401532F53");
  });

  test("Word XML 只填入標題、日期與學生姓名", () => {
    const xml = patchBackupDocumentXml(makeTemplateXml(), makeModel(1, "安&明"));
    expect(xml).toContain("2026 MPM 8月上課時間表");
    expect(xml).toContain("8/3一");
    expect(xml).toContain("安&amp;明");
    expect(xml).toContain('w:eastAsia="微軟正黑體"');
    expect(xml).toContain('<w:sz w:val="20"/>');
    expect(xml).toContain('<w:noWrap/><w:fitText w:val="1"/>');
    expect(xml.match(/<w:tbl>/g)).toHaveLength(1);
    expect(xml).not.toContain('w:type="page"');
  });

  test("Word XML 會複製完整課表作為續頁", () => {
    const xml = patchBackupDocumentXml(makeTemplateXml(), makeModel(37));
    expect(xml.match(/<w:tbl>/g)).toHaveLength(2);
    expect(xml).toContain("（續頁 2）");
    expect(xml.match(/w:type="page"/g)).toHaveLength(1);
    expect(xml).toContain("學生36");
  });

  test("列印版保留註記欄、時段與每一頁", () => {
    const html = buildBackupPrintHtml(makeModel(37, "<安安>"));
    expect(html.match(/class="backup-print-page"/g)).toHaveLength(2);
    expect(html).toContain("backup-note");
    expect(html).toContain("3:00");
    expect(html).toContain("4:30");
    expect(html).toContain("&lt;安安&gt;");
    expect(html).not.toContain("<安安>");
    expect(html).toContain("@page { size: A4 landscape;");
  });
});
