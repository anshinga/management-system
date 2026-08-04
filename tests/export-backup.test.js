import { describe, expect, test } from "vitest";
import {
  buildBackupExportModel,
  formatBackupFileName,
  getBackupPageCellStudents,
  getBackupTemplatePlacements,
  getDefaultBackupWeekStart,
} from "../js/domain/export-backup.js";
import { formatDate } from "../js/store.js";

function student(id, grade = 1, status = "active") {
  return { id, name: `學生${id}`, grade, status };
}

const summer = {
  id: "summer-2026",
  name: "2026 暑假",
  startDate: "2026-07-01",
  endDate: "2026-08-31",
};

describe("export backup domain", () => {
  test("預設選取目前週的下一週", () => {
    expect(formatDate(getDefaultBackupWeekStart(new Date(2026, 6, 29)))).toBe("2026-08-03");
  });

  test("以唯讀方式沿用一般排課，保留目標週臨時排課並排除停課學生", () => {
    const state = {
      students: [
        { id: "s1", name: "安安", grade: 2, status: "active" },
        { id: "s2", name: "停課生", grade: 1, status: "paused" },
        { id: "s3", name: "小明", grade: 1, status: "active" },
      ],
      seasons: [summer],
      scheduleEntries: [
        { studentId: "s1", seasonId: summer.id, dateKey: "2026-07-27", slot: "15:00" },
        { studentId: "s2", seasonId: summer.id, dateKey: "2026-07-28", slot: "16:30" },
        { studentId: "s3", seasonId: summer.id, dateKey: "2026-07-29", slot: "18:00", temporary: true },
        { studentId: "s3", seasonId: summer.id, dateKey: "2026-08-03", slot: "16:30", temporary: true },
        { studentId: "s3", seasonId: summer.id, dateKey: "2026-08-03", slot: "18:00", temporary: true },
      ],
      scheduleOverrides: [],
    };

    const model = buildBackupExportModel(state, "2026-08-03");

    expect(model.weekStart).toBe("2026-08-03");
    expect(model.weekEnd).toBe("2026-08-08");
    expect(model.totalOccurrences).toBe(3);
    expect(model.uniqueStudentCount).toBe(2);
    expect(model.days[0].slots.find(({ slot }) => slot === "15:00").students.map(({ id }) => id)).toEqual(["s1"]);
    expect(model.days[0].slots.find(({ slot }) => slot === "16:30").students.map(({ id }) => id)).toEqual(["s3"]);
    expect(model.days[0].slots.find(({ slot }) => slot === "18:00").students.map(({ id }) => id)).toEqual(["s3"]);
    expect(JSON.stringify(model)).not.toContain("停課生");
  });

  test("週次覆寫會阻止原排課進入匯出，且不會改動來源 state", () => {
    const state = {
      students: [{ id: "s1", name: "安安", grade: 2, status: "active" }],
      seasons: [summer],
      scheduleEntries: [
        { studentId: "s1", seasonId: summer.id, dateKey: "2026-07-27", slot: "15:00" },
      ],
      scheduleOverrides: [{
        studentId: "s1",
        seasonId: summer.id,
        weekStart: "2026-08-03",
        sourceWeekday: 1,
        sourceSlot: "15:00",
      }],
    };
    const original = structuredClone(state);

    const model = buildBackupExportModel(state, "2026-08-03");

    expect(model.totalOccurrences).toBe(0);
    expect(state).toEqual(original);
  });

  test("原時段超過容量時先補到同一天的下一個時段", () => {
    const students = Array.from({ length: 9 }, (_, index) => student(`s${index + 1}`, index + 1));
    const state = {
      students,
      seasons: [summer],
      scheduleEntries: students.map(({ id }) => ({
        studentId: id,
        seasonId: summer.id,
        dateKey: "2026-08-03",
        slot: "15:00",
      })),
      scheduleOverrides: [],
    };

    const model = buildBackupExportModel(state, "2026-08-03");
    const firstPage = getBackupPageCellStudents(model, 0, "2026-08-03", "15:00");
    const nextSlot = getBackupPageCellStudents(model, 0, "2026-08-03", "16:30");

    expect(model.pageCount).toBe(1);
    expect(model.reassignedOccurrenceCount).toBe(1);
    expect(firstPage).toHaveLength(8);
    expect(nextSlot).toHaveLength(1);
    expect(getBackupTemplatePlacements(model)).toContainEqual(
      expect.objectContaining({ row: 5, column: 1, slot: "16:30", student: nextSlot[0] }),
    );
  });

  test("下一時段已滿時繼續向後補位，並保留各時段原排課學生的優先位置", () => {
    const early = Array.from({ length: 10 }, (_, index) => student(`early-${index + 1}`, index + 1));
    const middle = Array.from({ length: 8 }, (_, index) => student(`middle-${index + 1}`, index + 1));
    const evening = Array.from({ length: 9 }, (_, index) => student(`evening-${index + 1}`, index + 1));
    const students = [...early, ...middle, ...evening];
    const entries = [
      ...early.map(({ id }) => ({ studentId: id, slot: "15:00" })),
      ...middle.map(({ id }) => ({ studentId: id, slot: "16:30" })),
      ...evening.map(({ id }) => ({ studentId: id, slot: "18:00" })),
    ].map((entry) => ({
      ...entry,
      seasonId: summer.id,
      dateKey: "2026-08-03",
    }));

    const model = buildBackupExportModel({
      students,
      seasons: [summer],
      scheduleEntries: entries,
      scheduleOverrides: [],
    }, "2026-08-03");
    const at1800 = getBackupPageCellStudents(model, 0, "2026-08-03", "18:00");
    const at1930 = getBackupPageCellStudents(model, 0, "2026-08-03", "19:30");

    expect(model.pageCount).toBe(1);
    expect(model.reassignedOccurrenceCount).toBe(2);
    expect(at1800.slice(0, 9).map(({ id }) => id)).toEqual(evening.map(({ id }) => id));
    expect(at1800[9].id).toBe("early-9");
    expect(at1930.map(({ id }) => id)).toEqual(["early-10"]);
  });

  test("同一天最後時段也放滿時才建立續頁", () => {
    const slotCounts = { "15:00": 8, "16:30": 8, "18:00": 10, "19:30": 11 };
    const students = Object.entries(slotCounts).flatMap(([slot, count]) => (
      Array.from({ length: count }, (_, index) => student(`${slot}-${index + 1}`, index + 1))
    ));
    const scheduleEntries = Object.entries(slotCounts).flatMap(([slot, count]) => (
      Array.from({ length: count }, (_, index) => ({
        studentId: `${slot}-${index + 1}`,
        seasonId: summer.id,
        dateKey: "2026-08-03",
        slot,
      }))
    ));

    const model = buildBackupExportModel({
      students,
      seasons: [summer],
      scheduleEntries,
      scheduleOverrides: [],
    }, "2026-08-03");
    const continuation = getBackupPageCellStudents(model, 1, "2026-08-03", "19:30");

    expect(model.pageCount).toBe(2);
    expect(model.reassignedOccurrenceCount).toBe(0);
    expect(continuation).toHaveLength(1);
    expect(getBackupTemplatePlacements(model, 1)).toEqual([
      expect.objectContaining({ row: 14, column: 1, slot: "19:30", student: continuation[0] }),
    ]);
  });

  test("週六兩個時段分別寫入版型上半部與下半部", () => {
    const fall = {
      id: "fall-2026",
      name: "2026 上學期",
      startDate: "2026-09-01",
      endDate: "2027-01-31",
    };
    const state = {
      students: [student("am"), student("late")],
      seasons: [fall],
      scheduleEntries: [
        { studentId: "am", seasonId: fall.id, dateKey: "2026-09-05", slot: "09:00" },
        { studentId: "late", seasonId: fall.id, dateKey: "2026-09-05", slot: "10:30" },
      ],
      scheduleOverrides: [],
    };

    const model = buildBackupExportModel(state, "2026-08-31");
    const placements = getBackupTemplatePlacements(model);

    expect(model.days[5].slots.map(({ slot }) => slot)).toEqual(["09:00", "10:30"]);
    expect(placements).toEqual([
      expect.objectContaining({ row: 1, column: 21, slot: "09:00" }),
      expect.objectContaining({ row: 9, column: 21, slot: "10:30" }),
    ]);
  });

  test("檔名包含完整週區間", () => {
    const model = buildBackupExportModel({
      students: [],
      seasons: [summer],
      scheduleEntries: [],
      scheduleOverrides: [],
    }, "2026-08-03");
    expect(formatBackupFileName(model)).toBe("2026-08-03_2026-08-08_點名備份.docx");
  });
});
