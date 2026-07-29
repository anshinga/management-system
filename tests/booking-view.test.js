import { describe, expect, test, vi } from "vitest";

vi.mock("../js/repositories/booking-repository.js", () => ({
  closeBookingCampaign: vi.fn(),
  getBookingInvitationQr: vi.fn(),
  getBookingPublicUrl: (id) => `https://example.com/booking.html?token=${id}`,
  publishBookingCampaign: vi.fn(),
  resetBookingInvitation: vi.fn(),
  saveBookingCampaign: vi.fn(),
}));

const {
  renderBookingCampaigns,
  renderSlotOptions,
} = await import("../js/views/booking-campaigns.js");

const state = {
  students: [
    { id: "student-1", name: "敬澄", grade: 1, status: "active" },
    { id: "student-2", name: "宥家", grade: 2, status: "active" },
  ],
  seasons: [{
    id: "summer-2026",
    name: "2026 暑假",
    startDate: "2026-07-01",
    endDate: "2026-08-31",
    active: true,
  }],
  bookingCampaigns: [{
    id: "campaign-1",
    name: "2026 暑假選課",
    seasonId: "summer-2026",
    startDate: "2026-07-01",
    endDate: "2026-08-31",
    registrationDeadline: new Date("2026-06-20T12:00:00Z"),
    minChoices: 1,
    maxChoices: 2,
    capacity: 10,
    availableSlots: ["1__15:00", "3__16:30"],
    excludedDates: [],
    status: "open",
  }],
  bookingInvitations: [
    {
      id: "private-token-1",
      campaignId: "campaign-1",
      studentId: "student-1",
      status: "submitted",
    },
    {
      id: "private-token-2",
      campaignId: "campaign-1",
      studentId: "student-2",
      status: "invited",
    },
  ],
  bookingSubmissions: [{
    id: "private-token-1",
    campaignId: "campaign-1",
    studentId: "student-1",
    selectedSlots: ["1__15:00", "3__16:30"],
  }],
};

describe("booking campaigns view", () => {
  test("活動時段依時期顯示正確營業時間", () => {
    const summerHtml = renderSlotOptions([], state.seasons[0]);
    const fallHtml = renderSlotOptions([], {
      id: "fall-2026",
      name: "2026 上學期",
    });

    expect(summerHtml).not.toContain("<legend>週六</legend>");
    expect(summerHtml).not.toContain("09:00");
    expect(fallHtml).toContain("<legend>週六</legend>");
    expect(fallHtml).toContain('value="6__09:00"');
    expect(fallHtml).toContain('value="6__10:30"');
    expect(fallHtml).not.toContain('value="6__15:00"');
  });

  test("活動摘要會顯示固定容量、時段與完成進度", () => {
    const html = renderBookingCampaigns(state);
    expect(html).toContain("2026 暑假選課");
    expect(html).toContain("每時段 10 人");
    expect(html).toContain("1 / 2 已送出");
    expect(html).toContain("週一 15:00");
    expect(html).toContain("週三 16:30");
    expect(html).toContain("補建學生連結");
    expect(html).toContain("提前截止");
  });
});
