import { collection, doc } from "firebase/firestore";
import { APP_CONFIG } from "../config.js";
import { db } from "../firebase/firestore.js";

export const COLLECTIONS = Object.freeze({
  members: "members",
  students: "students",
  seasons: "seasons",
  scheduleEntries: "scheduleEntries",
  scheduleOverrides: "scheduleOverrides",
  attendance: "attendance",
  leaveRecords: "leaveRecords",
  billingCycles: "billingCycles",
  payments: "payments",
  bookingCampaigns: "bookingCampaigns",
  bookingInvitations: "bookingInvitations",
  bookingSubmissions: "bookingSubmissions",
  bookingSlotCounters: "bookingSlotCounters",
  migrations: "migrations",
});

export function workspaceRef() {
  return doc(db, "workspaces", APP_CONFIG.workspaceId);
}

export function workspaceCollectionRef(name) {
  if (!Object.values(COLLECTIONS).includes(name)) {
    throw new Error(`未知的工作區集合：${name}`);
  }
  return collection(workspaceRef(), name);
}

export function workspaceDocumentRef(name, id) {
  if (!id) throw new Error("Firestore 文件 ID 不可為空白。");
  return doc(workspaceCollectionRef(name), id);
}
