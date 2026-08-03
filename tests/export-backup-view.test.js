import { describe, expect, test } from "vitest";
import { renderExportBackup } from "../js/views/export-backup.js";

const state = {
  students: [{ id: "s1", name: "安安", grade: 1, status: "active" }],
  seasons: [{
    id: "summer-2026",
    name: "2026 暑假",
    startDate: "2026-07-01",
    endDate: "2026-08-31",
  }],
  scheduleEntries: [{
    studentId: "s1",
    seasonId: "summer-2026",
    dateKey: "2026-08-03",
    slot: "15:00",
  }],
  scheduleOverrides: [],
};

describe("export backup view", () => {
  test("提供週次切換、Word、列印與六日預覽", () => {
    const html = renderExportBackup(state, { weekStart: "2026-08-03" });
    expect(html).toContain("匯出備份");
    expect(html).toContain('data-action="download-backup-word"');
    expect(html).toContain('data-action="print-backup"');
    expect(html).toContain('data-action="prev-backup-week"');
    expect(html).toContain('data-action="next-backup-week"');
    expect(html.match(/class="export-backup-day"/g)).toHaveLength(6);
    expect(html).toContain("8/3 週一");
    expect(html).toContain("8/8 週六");
    expect(html).toContain("安安");
    expect(html).toContain("匯出只讀取資料，不會修改排課");
  });
});
