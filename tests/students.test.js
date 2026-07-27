import { describe, expect, test } from "vitest";
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
});

describe("學生紀錄", () => {
  test("上一次上課日期只作為第一筆顯示，不會產生 attendance", () => {
    const html = renderRecords({
      students: [{
        ...students[0],
        previousLessonDate: "2026-07-20",
      }],
      attendance: [{
        studentId: "a",
        dateKey: "2026-07-27",
        arrivalTime: "15:00",
        term: 1,
        lessonNumber: 9,
      }],
    });

    expect(html.indexOf("2026-07-20")).toBeLessThan(html.indexOf("2026-07-27"));
    expect(html).toContain("上一次上課・舊資料起點");
  });

  test("沒有日期也沒有正式紀錄時維持空資料提示", () => {
    expect(renderRecords({
      students: [students[0]],
      attendance: [],
    })).toContain("尚無點名紀錄");
  });
});
