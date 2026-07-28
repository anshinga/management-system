import { describe, expect, test } from "vitest";
import {
  getArchivePeriods,
  getBiMonthPeriod,
  getCurrentStudentRecords,
  resolvePreviousLessonFields,
} from "../js/domain/records.js";
import { renderRecords } from "../js/views/records.js";
import { renderStudents, sortStudents } from "../js/views/students.js";

const students = [
  { id: "a", name: "甲", grade: 3, currentLessonCount: 8, currentTerm: 1, status: "active" },
  { id: "b", name: "乙", grade: 1, currentLessonCount: 20, currentTerm: 1, status: "active" },
  { id: "c", name: "丙", grade: 2, currentLessonCount: 2, currentTerm: 1, status: "active" },
];

describe("學生管理", () => {
  test("可以依年級或目前堂數排序", () => {
    expect(sortStudents(students, "grade").map((student) => student.id)).toEqual(["b", "c", "a"]);
    expect(sortStudents(students, "lessons-desc").map((student) => student.id)).toEqual(["b", "a", "c"]);
    expect(sortStudents(students, "lessons-asc").map((student) => student.id)).toEqual(["c", "a", "b"]);
  });

  test("排序選項會保留在重新渲染的畫面中", () => {
    const html = renderStudents({ students }, { sort: "lessons-desc" });
    expect(html).toContain('value="lessons-desc" selected');
  });

  test("學生備註會顯示摘要並出現在編輯表單", () => {
    const html = renderStudents({
      students: [{ ...students[0], note: "這是一段學生備註" }],
    });
    expect(html).toContain("這是一段學生備註");
  });
});

describe("舊資料快照", () => {
  test("第一次輸入日期時會固定當下的期數與堂數", () => {
    expect(resolvePreviousLessonFields(null, {
      previousLessonDate: "2026-07-20",
      currentTerm: 2,
      currentLessonCount: 6,
    })).toEqual({
      previousLessonTerm: 2,
      previousLessonNumber: 6,
    });
  });

  test("既有日期可從第一筆正式點名反推舊資料堂數", () => {
    expect(resolvePreviousLessonFields({
      id: "a",
      previousLessonDate: "2026-07-20",
      currentTerm: 1,
      currentLessonCount: 9,
    }, {
      previousLessonDate: "2026-07-20",
      currentTerm: 1,
      currentLessonCount: 9,
    }, [{
      studentId: "a",
      dateKey: "2026-07-27",
      term: 1,
      lessonNumber: 9,
    }])).toEqual({
      previousLessonTerm: 1,
      previousLessonNumber: 8,
    });
  });

  test("已固定的舊資料堂數不會隨目前堂數改變", () => {
    expect(resolvePreviousLessonFields({
      previousLessonDate: "2026-07-20",
      previousLessonTerm: 1,
      previousLessonNumber: 4,
    }, {
      previousLessonDate: "2026-07-20",
      currentTerm: 1,
      currentLessonCount: 10,
    })).toEqual({
      previousLessonTerm: 1,
      previousLessonNumber: 4,
    });
  });

  test("清除日期時會一起清除舊資料期數與堂數", () => {
    expect(resolvePreviousLessonFields({
      previousLessonDate: "2026-07-20",
      previousLessonTerm: 1,
      previousLessonNumber: 4,
    }, {
      previousLessonDate: "",
      currentTerm: 1,
      currentLessonCount: 10,
    })).toEqual({
      previousLessonTerm: 0,
      previousLessonNumber: 0,
    });
  });

  test("新一期尚未上課時會把前一期第 24 堂保存為舊資料", () => {
    expect(resolvePreviousLessonFields(null, {
      previousLessonDate: "2026-07-20",
      currentTerm: 2,
      currentLessonCount: 0,
    })).toEqual({
      previousLessonTerm: 1,
      previousLessonNumber: 24,
    });
  });

  test("第一期第 0 堂不能設定上一次上課日期", () => {
    expect(() => resolvePreviousLessonFields(null, {
      previousLessonDate: "2026-07-20",
      currentTerm: 1,
      currentLessonCount: 0,
    })).toThrow("目前堂數必須至少有 1 堂");
  });
});

describe("固定雙月紀錄", () => {
  const attendance = [
    { studentId: "a", dateKey: "2026-05-10", arrivalTime: "15:00", term: 1, lessonNumber: 6 },
    { studentId: "a", dateKey: "2026-06-30", arrivalTime: "15:00", term: 1, lessonNumber: 7 },
    { studentId: "a", dateKey: "2026-07-27", arrivalTime: "15:00", term: 1, lessonNumber: 8 },
  ];

  test("月份會固定分成 1–2、3–4 等雙月區間", () => {
    expect(getBiMonthPeriod("2026-02-28")).toMatchObject({
      key: "2026-01",
      startDate: "2026-01-01",
      endDate: "2026-02-28",
    });
    expect(getBiMonthPeriod("2026-12-01")).toMatchObject({
      key: "2026-11",
      startDate: "2026-11-01",
      endDate: "2026-12-31",
    });
  });

  test("主畫面只保留目前雙月與此前最後一筆", () => {
    expect(getCurrentStudentRecords(students[0], attendance, "2026-07-27").map((item) => item.dateKey))
      .toEqual(["2026-06-30", "2026-07-27"]);
  });

  test("過去紀錄會形成雙月資料夾", () => {
    expect(getArchivePeriods([students[0]], attendance, "2026-07-27")).toEqual([
      {
        key: "2026-05",
        label: "2026 年 5–6 月",
        startDate: "2026-05-01",
        endDate: "2026-06-30",
        count: 2,
      },
    ]);
  });

  test("舊資料格只顯示日期、期數與堂數", () => {
    const html = renderRecords({
      students: [{
        ...students[0],
        previousLessonDate: "2026-07-20",
        previousLessonTerm: 1,
        previousLessonNumber: 7,
      }],
      attendance: [attendance[2]],
    }, { todayDate: "2026-07-27" });

    expect(html.indexOf("2026-07-20")).toBeLessThan(html.indexOf("2026-07-27"));
    expect(html).toContain("第 1 期・第 7 堂");
    expect(html).not.toContain("上一次上課");
    expect(html).not.toContain("舊資料起點");
  });

  test("資料夾與期間畫面只顯示對應紀錄", () => {
    const state = { students: [students[0]], attendance };
    const folders = renderRecords(state, { view: "folders", todayDate: "2026-07-27" });
    const period = renderRecords(state, {
      view: "period",
      periodKey: "2026-05",
      todayDate: "2026-07-27",
    });
    expect(folders).toContain("2026 年 5–6 月");
    expect(folders).toContain("2 筆紀錄");
    expect(period).toContain("2026-05-10");
    expect(period).toContain("2026-06-30");
    expect(period).not.toContain("2026-07-27");
  });

  test("沒有日期也沒有正式紀錄時維持空資料提示", () => {
    expect(renderRecords({
      students: [students[0]],
      attendance: [],
    }, { todayDate: "2026-07-27" })).toContain("本期尚無點名紀錄");
  });
});
