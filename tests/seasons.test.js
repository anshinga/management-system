import { describe, expect, test } from "vitest";
import { buildAcademicSeasons } from "../js/repositories/workspace-repository.js";

describe("academic seasons", () => {
  test("每個學年度會補齊暑假、上學期、寒假與下學期", () => {
    expect(buildAcademicSeasons(new Date(2026, 6, 29))).toEqual([
      {
        id: "summer-2026",
        name: "2026 暑假",
        startDate: "2026-07-01",
        endDate: "2026-08-31",
        active: true,
      },
      {
        id: "fall-2026",
        name: "2026 上學期",
        startDate: "2026-09-01",
        endDate: "2027-01-31",
        active: false,
      },
      {
        id: "winter-2027",
        name: "2027 寒假",
        startDate: "2027-02-01",
        endDate: "2027-02-28",
        active: false,
      },
      {
        id: "spring-2027",
        name: "2027 下學期",
        startDate: "2027-03-01",
        endDate: "2027-06-30",
        active: false,
      },
    ]);
  });

  test("寒假結束日期會正確處理閏年", () => {
    const winter = buildAcademicSeasons(new Date(2028, 0, 15))
      .find((season) => season.id === "winter-2028");
    expect(winter.endDate).toBe("2028-02-29");
    expect(winter.active).toBe(false);
  });
});
