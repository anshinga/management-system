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

  test("時段超過容量時說明會補到同一天後續時段", () => {
    const students = Array.from({ length: 9 }, (_, index) => ({
      id: `overflow-${index + 1}`,
      name: `學生${index + 1}`,
      grade: index + 1,
      status: "active",
    }));
    const html = renderExportBackup({
      students,
      seasons: state.seasons,
      scheduleEntries: students.map(({ id }) => ({
        studentId: id,
        seasonId: "summer-2026",
        dateKey: "2026-08-03",
        slot: "15:00",
      })),
      scheduleOverrides: [],
    }, { weekStart: "2026-08-03" });

    expect(html).toContain("有 1 人次因原時段容量不足");
    expect(html).toContain("同一天的後續時段");
    expect(html).toContain('<strong class="stat-value">1</strong><small class="stat-note">頁</small>');
  });

  test("課程紀錄模式提供雙月資料夾、Word、列印與一堂一格預覽", () => {
    const html = renderExportBackup({
      students: [
        ...state.students,
        { id: "paused", name: "停課生", grade: 1, status: "paused" },
      ],
      attendance: [
        { studentId: "s1", dateKey: "2026-06-30", arrivalTime: "15:00", term: 1, lessonNumber: 7 },
        { studentId: "s1", dateKey: "2026-07-27", arrivalTime: "15:00", term: 1, lessonNumber: 8 },
        { studentId: "paused", dateKey: "2026-07-27", arrivalTime: "15:00", term: 1, lessonNumber: 8 },
      ],
    }, { kind: "records", periodKey: "2026-07", todayDate: "2026-08-03" });

    expect(html).toContain("課程紀錄表");
    expect(html).toContain('data-action="download-records-backup-word"');
    expect(html).toContain('data-action="print-records-backup"');
    expect(html).toContain('data-action="select-records-backup-period"');
    expect(html).toContain("115 年 7–8 月課程紀錄");
    expect(html).toContain("6/30，7");
    expect(html).toContain("7/27，8");
    expect(html).toContain("安安");
    expect(html).not.toContain("停課生");
    expect(html).toContain("匯出只讀取資料，不會修改點名紀錄");
  });
});
