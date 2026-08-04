import { describe, expect, test } from "vitest";
import {
  buildRecordsBackupModel,
  formatRecordsBackupFileName,
  getRecordsBackupPeriods,
} from "../js/domain/records-backup.js";

function attendance(studentId, dateKey, lessonNumber, arrivalTime = "15:00") {
  return { studentId, dateKey, lessonNumber, arrivalTime, term: 1 };
}

describe("records backup domain", () => {
  test("提供目前雙月與既有紀錄資料夾", () => {
    const periods = getRecordsBackupPeriods({
      students: [{ id: "s1", status: "active" }],
      attendance: [attendance("s1", "2026-05-10", 1)],
    }, "2026-08-03");

    expect(periods.map(({ key }) => key)).toEqual(["2026-07", "2026-05"]);
    expect(periods[0].label).toBe("2026 年 7–8 月");
  });

  test("只匯出在讀學生並依年級與姓名排序", () => {
    const model = buildRecordsBackupModel({
      students: [
        { id: "paused", name: "停課生", grade: 1, status: "paused" },
        { id: "b", name: "子安", grade: 4, status: "active" },
        { id: "a", name: "安安", grade: 4, status: "active" },
        { id: "young", name: "小明", grade: 2, status: "active" },
      ],
      attendance: [attendance("paused", "2026-07-01", 1)],
    }, "2026-07", "2026-08-03");

    expect(model.rows.map(({ label }) => label)).toEqual(["2.小明", "4.子安", "4.安安"]);
    expect(JSON.stringify(model)).not.toContain("停課生");
  });

  test("期間開始前最後一堂會銜接，期間後的紀錄不會混入", () => {
    const model = buildRecordsBackupModel({
      students: [{ id: "s1", name: "安安", grade: 3, status: "active" }],
      attendance: [
        attendance("s1", "2026-05-10", 5),
        attendance("s1", "2026-06-30", 6),
        attendance("s1", "2026-07-27", 7),
        attendance("s1", "2026-09-01", 8),
      ],
    }, "2026-07", "2026-08-03");

    expect(model.rows[0].records.map(({ dateKey }) => dateKey))
      .toEqual(["2026-06-30", "2026-07-27"]);
    expect(model.rows[0].records[0].isCarryover).toBe(true);
    expect(model.periodRecordCount).toBe(1);
    expect(model.carryoverCount).toBe(1);
  });

  test("期間沒有上課仍保留此前最後一堂，從未上課則保留空列", () => {
    const model = buildRecordsBackupModel({
      students: [
        { id: "history", name: "有紀錄", grade: 1, status: "active" },
        { id: "new", name: "新學生", grade: 2, status: "active" },
      ],
      attendance: [attendance("history", "2026-06-20", 3)],
    }, "2026-07", "2026-08-03");

    expect(model.rows[0].records.map(({ shortDate }) => shortDate)).toEqual(["6/20"]);
    expect(model.rows[1].records).toEqual([]);
  });

  test("同日兩堂保留兩格，第 16 堂建立續列", () => {
    const records = Array.from({ length: 16 }, (_, index) => attendance(
      "s1",
      index < 2 ? "2026-07-01" : `2026-07-${String(index).padStart(2, "0")}`,
      index + 1,
      `${String(15 + Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`,
    ));
    const model = buildRecordsBackupModel({
      students: [{ id: "s1", name: "承諺", grade: 4, status: "active" }],
      attendance: records,
    }, "2026-07", "2026-08-03");

    expect(model.rows).toHaveLength(2);
    expect(model.rows[0].records).toHaveLength(15);
    expect(model.rows[0].records.slice(0, 2).map(({ shortDate }) => shortDate))
      .toEqual(["7/1", "7/1"]);
    expect(model.rows[1].label).toBe("4.承諺(續)");
    expect(model.rows[1].records).toHaveLength(1);
    expect(model.continuationRowCount).toBe(1);
  });

  test("標題使用民國期間，檔名使用完整西元日期", () => {
    const model = buildRecordsBackupModel({ students: [], attendance: [] }, "2026-07", "2026-08-03");
    expect(model.title).toBe("115 年 7–8 月課程紀錄");
    expect(formatRecordsBackupFileName(model)).toBe("2026-07-01_2026-08-31_課程紀錄備份.docx");
    expect(model.pageCount).toBe(3);
  });
});
