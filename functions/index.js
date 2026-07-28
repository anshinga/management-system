import { randomBytes } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import QRCode from "qrcode";
import {
  expandSelectedSlots,
  generateRecurringDates,
  makeCounterId,
  parseSlotKey,
  validateCampaign,
} from "./booking-domain.js";

initializeApp();
setGlobalOptions({
  region: "asia-east1",
  maxInstances: 20,
  timeoutSeconds: 60,
});

const db = getFirestore();
const WORKSPACE_ID = "mpm-main";
const OWNER_EMAIL = "anshinga79@gmail.com";
const WEEKDAY_LABELS = Object.freeze(["", "週一", "週二", "週三", "週四", "週五", "週六"]);
const workspace = db.collection("workspaces").doc(WORKSPACE_ID);
const collections = Object.freeze({
  students: workspace.collection("students"),
  scheduleEntries: workspace.collection("scheduleEntries"),
  attendance: workspace.collection("attendance"),
  campaigns: workspace.collection("bookingCampaigns"),
  invitations: workspace.collection("bookingInvitations"),
  submissions: workspace.collection("bookingSubmissions"),
  counters: workspace.collection("bookingSlotCounters"),
  members: workspace.collection("members"),
});

function callableOptions() {
  return { cors: true };
}

function requireText(value, label) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > 500) throw new HttpsError("invalid-argument", `${label}不正確。`);
  return text;
}

async function requireStaff(auth) {
  if (!auth?.uid || auth.token?.email_verified !== true) {
    throw new HttpsError("unauthenticated", "請先登入管理系統。");
  }
  const email = String(auth.token.email || "").trim().toLowerCase();
  if (email === OWNER_EMAIL) return;
  const member = await collections.members.doc(auth.uid).get();
  if (!member.exists
    || member.data().active !== true
    || !["owner", "teacher"].includes(member.data().role)) {
    throw new HttpsError("permission-denied", "您沒有管理選課活動的權限。");
  }
}

function toPublicCampaign(campaign) {
  return {
    id: campaign.id,
    name: campaign.name,
    startDate: campaign.startDate,
    endDate: campaign.endDate,
    minChoices: campaign.minChoices,
    maxChoices: campaign.maxChoices,
    capacity: campaign.capacity,
    status: campaign.status,
    registrationDeadline: campaign.registrationDeadline.toMillis(),
  };
}

function effectiveCampaignOpen(campaign) {
  return campaign.status === "open"
    && campaign.registrationDeadline.toMillis() >= Date.now();
}

async function getInvitationContext(token) {
  const invitationRef = collections.invitations.doc(token);
  const invitation = await invitationRef.get();
  if (!invitation.exists) throw new HttpsError("not-found", "這個選課連結不存在或已失效。");
  const invitationData = invitation.data();
  const [campaign, student, submission] = await Promise.all([
    collections.campaigns.doc(invitationData.campaignId).get(),
    collections.students.doc(invitationData.studentId).get(),
    collections.submissions.doc(token).get(),
  ]);
  if (!campaign.exists || !student.exists) {
    throw new HttpsError("failed-precondition", "活動或學生資料已不存在。");
  }
  return {
    invitationRef,
    invitation: { id: invitation.id, ...invitationData },
    campaignRef: campaign.ref,
    campaign: { id: campaign.id, ...campaign.data() },
    student: { id: student.id, ...student.data() },
    submission: submission.exists ? { id: submission.id, ...submission.data() } : null,
  };
}

export const publishBookingCampaign = onCall(callableOptions(), async (request) => {
  await requireStaff(request.auth);
  const campaignId = requireText(request.data?.campaignId, "活動 ID");
  const campaignRef = collections.campaigns.doc(campaignId);
  const campaignSnapshot = await campaignRef.get();
  if (!campaignSnapshot.exists) throw new HttpsError("not-found", "找不到選課活動。");
  const campaign = { id: campaignSnapshot.id, ...campaignSnapshot.data() };
  try {
    validateCampaign(campaign);
  } catch (error) {
    throw new HttpsError("failed-precondition", error.message);
  }
  if (!["draft", "open"].includes(campaign.status)) {
    throw new HttpsError("failed-precondition", "已截止的活動不能重新開放。");
  }
  if (campaign.registrationDeadline.toMillis() < Date.now()) {
    throw new HttpsError("failed-precondition", "活動截止時間必須晚於現在。");
  }

  const [studentsSnapshot, invitationsSnapshot] = await Promise.all([
    collections.students.where("status", "==", "active").get(),
    collections.invitations.where("campaignId", "==", campaignId).get(),
  ]);
  const invitedStudentIds = new Set(invitationsSnapshot.docs.map((document) => document.data().studentId));
  const batch = db.batch();
  let operationCount = 0;
  let createdInvitations = 0;

  if (campaign.status === "draft") {
    const schedulesSnapshot = await collections.scheduleEntries
      .where("dateKey", ">=", campaign.startDate)
      .where("dateKey", "<=", campaign.endDate)
      .get();
    const dateSlotCounts = new Map();
    schedulesSnapshot.docs.forEach((document) => {
      const entry = document.data();
      if (entry.seasonId !== campaign.seasonId) return;
      const key = `${entry.dateKey}\u0000${entry.slot}`;
      dateSlotCounts.set(key, (dateSlotCounts.get(key) || 0) + 1);
    });
    campaign.availableSlots.forEach((slotKey) => {
      const { weekday, slot } = parseSlotKey(slotKey);
      const baselineCount = Math.max(0, ...generateRecurringDates(
        campaign.startDate,
        campaign.endDate,
        weekday,
        campaign.excludedDates,
      ).map((dateKey) => dateSlotCounts.get(`${dateKey}\u0000${slot}`) || 0));
      batch.set(collections.counters.doc(makeCounterId(campaignId, slotKey)), {
        campaignId,
        slotKey,
        baselineCount,
        count: baselineCount,
        capacity: campaign.capacity,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      operationCount += 1;
    });
    batch.update(campaignRef, {
      status: "open",
      publishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    operationCount += 1;
  }

  studentsSnapshot.docs.forEach((student) => {
    if (invitedStudentIds.has(student.id)) return;
    const token = randomBytes(24).toString("base64url");
    batch.set(collections.invitations.doc(token), {
      campaignId,
      studentId: student.id,
      status: "invited",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    operationCount += 1;
    createdInvitations += 1;
  });
  if (operationCount > 450) {
    throw new HttpsError("resource-exhausted", "學生或時段數量過多，請分批建立活動。");
  }
  if (operationCount) await batch.commit();
  return { createdInvitations };
});

export const closeBookingCampaign = onCall(callableOptions(), async (request) => {
  await requireStaff(request.auth);
  const campaignId = requireText(request.data?.campaignId, "活動 ID");
  const campaignRef = collections.campaigns.doc(campaignId);
  const campaign = await campaignRef.get();
  if (!campaign.exists) throw new HttpsError("not-found", "找不到選課活動。");
  if (campaign.data().status !== "open") {
    throw new HttpsError("failed-precondition", "只有開放中的活動可以截止。");
  }
  await campaignRef.update({
    status: "closed",
    closedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { status: "closed" };
});

export const getBookingInvitation = onCall(callableOptions(), async (request) => {
  const token = requireText(request.data?.token, "選課連結");
  const context = await getInvitationContext(token);
  const counterSnapshots = await Promise.all(
    context.campaign.availableSlots.map((slotKey) => (
      collections.counters.doc(makeCounterId(context.campaign.id, slotKey)).get()
    )),
  );
  const remainingBySlot = new Map(counterSnapshots.map((snapshot, index) => {
    const count = Number(snapshot.data()?.count || 0);
    return [
      context.campaign.availableSlots[index],
      Math.max(0, Number(context.campaign.capacity || 10) - count),
    ];
  }));
  return {
    campaign: {
      ...toPublicCampaign(context.campaign),
      isOpen: effectiveCampaignOpen(context.campaign),
      slots: context.campaign.availableSlots.map((slotKey) => ({
        key: slotKey,
        remaining: remainingBySlot.get(slotKey) || 0,
      })),
    },
    student: {
      name: context.student.name,
      grade: context.student.grade,
    },
    invitation: {
      status: context.invitation.status,
    },
    submission: context.submission ? {
      selectedSlots: context.submission.selectedSlots,
      submittedAt: context.submission.submittedAt?.toMillis?.() || null,
    } : null,
  };
});

export const submitBookingSelection = onCall(callableOptions(), async (request) => {
  const token = requireText(request.data?.token, "選課連結");
  const requestedSlots = Array.isArray(request.data?.selectedSlots)
    ? request.data.selectedSlots.map(String)
    : [];
  const result = await db.runTransaction(async (transaction) => {
    const invitationRef = collections.invitations.doc(token);
    const invitationSnapshot = await transaction.get(invitationRef);
    if (!invitationSnapshot.exists) throw new HttpsError("not-found", "這個選課連結不存在或已失效。");
    const invitation = invitationSnapshot.data();
    const campaignRef = collections.campaigns.doc(invitation.campaignId);
    const studentRef = collections.students.doc(invitation.studentId);
    const submissionRef = collections.submissions.doc(token);
    const [campaignSnapshot, studentSnapshot, submissionSnapshot] = await Promise.all([
      transaction.get(campaignRef),
      transaction.get(studentRef),
      transaction.get(submissionRef),
    ]);
    if (!campaignSnapshot.exists || !studentSnapshot.exists) {
      throw new HttpsError("failed-precondition", "活動或學生資料已不存在。");
    }
    if (submissionSnapshot.exists || invitation.status === "submitted") {
      throw new HttpsError("already-exists", "這位學生已經送出選擇。");
    }
    const campaign = { id: campaignSnapshot.id, ...campaignSnapshot.data() };
    if (!effectiveCampaignOpen(campaign)) {
      throw new HttpsError("failed-precondition", "這個選課活動尚未開放或已截止。");
    }
    if (studentSnapshot.data().status !== "active") {
      throw new HttpsError("failed-precondition", "這位學生目前不是在學狀態。");
    }
    let expanded;
    try {
      validateCampaign(campaign);
      expanded = expandSelectedSlots(campaign, invitation.studentId, requestedSlots);
    } catch (error) {
      throw new HttpsError("invalid-argument", error.message);
    }
    const counterRefs = expanded.selectedSlots.map((slotKey) => (
      collections.counters.doc(makeCounterId(campaign.id, slotKey))
    ));
    const scheduleRefs = expanded.entries.map((entry) => collections.scheduleEntries.doc(entry.id));
    const [counterSnapshots, scheduleSnapshots] = await Promise.all([
      transaction.getAll(...counterRefs),
      transaction.getAll(...scheduleRefs),
    ]);
    counterSnapshots.forEach((snapshot, index) => {
      if (!snapshot.exists) throw new HttpsError("failed-precondition", "活動名額尚未初始化。");
      if (Number(snapshot.data().count || 0) >= Number(snapshot.data().capacity || 10)) {
        const { weekday, slot } = parseSlotKey(expanded.selectedSlots[index]);
        throw new HttpsError(
          "resource-exhausted",
          `${WEEKDAY_LABELS[weekday]} ${slot} 已額滿，請重新選擇。`,
        );
      }
    });
    const createdScheduleEntryIds = [];
    expanded.entries.forEach((entry, index) => {
      if (scheduleSnapshots[index].exists) return;
      createdScheduleEntryIds.push(entry.id);
      transaction.set(scheduleRefs[index], {
        studentId: entry.studentId,
        seasonId: entry.seasonId,
        dateKey: entry.dateKey,
        slot: entry.slot,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    counterRefs.forEach((reference) => {
      transaction.update(reference, {
        count: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    transaction.set(submissionRef, {
      campaignId: campaign.id,
      studentId: invitation.studentId,
      selectedSlots: expanded.selectedSlots,
      scheduleEntryIds: expanded.entries.map((entry) => entry.id),
      createdScheduleEntryIds,
      submittedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(invitationRef, {
      status: "submitted",
      submittedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { selectedSlots: expanded.selectedSlots };
  });
  return result;
});

export const resetBookingInvitation = onCall(callableOptions(), async (request) => {
  await requireStaff(request.auth);
  const invitationId = requireText(request.data?.invitationId, "學生連結");
  await db.runTransaction(async (transaction) => {
    const invitationRef = collections.invitations.doc(invitationId);
    const submissionRef = collections.submissions.doc(invitationId);
    const [invitationSnapshot, submissionSnapshot] = await Promise.all([
      transaction.get(invitationRef),
      transaction.get(submissionRef),
    ]);
    if (!invitationSnapshot.exists || !submissionSnapshot.exists) {
      throw new HttpsError("failed-precondition", "這位學生尚未送出選擇。");
    }
    const invitation = invitationSnapshot.data();
    const submission = submissionSnapshot.data();
    const counterRefs = submission.selectedSlots.map((slotKey) => (
      collections.counters.doc(makeCounterId(invitation.campaignId, slotKey))
    ));
    const scheduleRefs = submission.createdScheduleEntryIds.map((id) => collections.scheduleEntries.doc(id));
    const selectedScheduleEntryIds = Array.isArray(submission.scheduleEntryIds)
      ? submission.scheduleEntryIds
      : submission.createdScheduleEntryIds;
    const attendanceRefs = selectedScheduleEntryIds.map((id) => collections.attendance.doc(id));
    const [counterSnapshots, scheduleSnapshots, attendanceSnapshots] = await Promise.all([
      transaction.getAll(...counterRefs),
      scheduleRefs.length ? transaction.getAll(...scheduleRefs) : Promise.resolve([]),
      attendanceRefs.length ? transaction.getAll(...attendanceRefs) : Promise.resolve([]),
    ]);
    if (attendanceSnapshots.some((snapshot) => snapshot.exists)) {
      throw new HttpsError("failed-precondition", "已有點名紀錄，不能重設這次選擇。");
    }
    if (scheduleSnapshots.some((snapshot) => (
      !snapshot.exists || snapshot.data().studentId !== invitation.studentId
    ))) {
      throw new HttpsError(
        "failed-precondition",
        "這次建立的排課已被人工調整，無法自動重設；請先由管理者確認排課內容。",
      );
    }
    scheduleSnapshots.forEach((snapshot) => {
      transaction.delete(snapshot.ref);
    });
    counterSnapshots.forEach((snapshot) => {
      if (!snapshot.exists) return;
      const baseline = Number(snapshot.data().baselineCount || 0);
      const count = Number(snapshot.data().count || 0);
      transaction.update(snapshot.ref, {
        count: Math.max(baseline, count - 1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    transaction.delete(submissionRef);
    transaction.update(invitationRef, {
      status: "invited",
      submittedAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { status: "invited" };
});

export const getBookingInvitationQr = onCall(callableOptions(), async (request) => {
  await requireStaff(request.auth);
  const invitationId = requireText(request.data?.invitationId, "學生連結");
  const publicUrl = requireText(request.data?.publicUrl, "公開連結");
  const invitation = await collections.invitations.doc(invitationId).get();
  if (!invitation.exists) throw new HttpsError("not-found", "找不到學生連結。");
  let parsedUrl;
  try {
    parsedUrl = new URL(publicUrl);
  } catch {
    throw new HttpsError("invalid-argument", "公開連結格式不正確。");
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)
    || parsedUrl.searchParams.get("token") !== invitationId) {
    throw new HttpsError("invalid-argument", "公開連結與學生邀請不一致。");
  }
  const svg = await QRCode.toString(parsedUrl.toString(), {
    type: "svg",
    margin: 1,
    width: 240,
    color: { dark: "#242522", light: "#ffffff" },
  });
  return { svg };
});
