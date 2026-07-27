import {
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { APP_CONFIG } from "../config.js";
import { db } from "../firebase/firestore.js";
import {
  COLLECTIONS,
  workspaceCollectionRef,
  workspaceDocumentRef,
  workspaceRef,
} from "./firestore-paths.js";

const DEFAULT_SEASONS = Object.freeze([
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
]);

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function isBootstrapOwner(user) {
  return Boolean(user?.uid
    && user.emailVerified
    && normalizeEmail(user.email) === normalizeEmail(APP_CONFIG.ownerEmail));
}

function getGradePromotionYear(date = new Date()) {
  const promotionDate = new Date(date.getFullYear(), 6, 1);
  return date >= promotionDate ? date.getFullYear() : date.getFullYear() - 1;
}

export async function bootstrapWorkspace(user) {
  if (!isBootstrapOwner(user)) {
    throw new Error("只有已設定的 owner 帳號可以初始化工作區。");
  }

  const workspace = workspaceRef();
  const member = workspaceDocumentRef(COLLECTIONS.members, user.uid);
  const seasonRefs = DEFAULT_SEASONS.map((season) => workspaceDocumentRef(COLLECTIONS.seasons, season.id));

  await runTransaction(db, async (transaction) => {
    const [workspaceSnapshot, memberSnapshot, ...seasonSnapshots] = await Promise.all([
      transaction.get(workspace),
      transaction.get(member),
      ...seasonRefs.map((reference) => transaction.get(reference)),
    ]);

    if (!workspaceSnapshot.exists()) {
      transaction.set(workspace, {
        name: APP_CONFIG.workspaceName,
        timezone: APP_CONFIG.timezone,
        schemaVersion: APP_CONFIG.schemaVersion,
        lastGradePromotionYear: getGradePromotionYear(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (Number(workspaceSnapshot.data().schemaVersion || 0) < APP_CONFIG.schemaVersion) {
      transaction.update(workspace, {
        schemaVersion: APP_CONFIG.schemaVersion,
        updatedAt: serverTimestamp(),
      });
    }

    if (!memberSnapshot.exists()) {
      transaction.set(member, {
        email: normalizeEmail(user.email),
        name: user.displayName || "系統管理員",
        role: "owner",
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    DEFAULT_SEASONS.forEach((season, index) => {
      if (seasonSnapshots[index].exists()) return;
      const { id, ...data } = season;
      transaction.set(seasonRefs[index], {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  });
}

export async function ensureWorkspaceAccess(user) {
  if (!user?.uid || !user.emailVerified) throw new Error("AUTH_REQUIRED");
  if (isBootstrapOwner(user)) await bootstrapWorkspace(user);
  try {
    const memberSnapshot = await getDoc(workspaceDocumentRef(COLLECTIONS.members, user.uid));
    if (!memberSnapshot.exists() || memberSnapshot.data().active !== true) {
      throw new Error("WORKSPACE_ACCESS_DENIED");
    }
    return memberSnapshot.data();
  } catch (error) {
    if (error?.message === "WORKSPACE_ACCESS_DENIED") throw error;
    if (error?.code === "permission-denied") throw new Error("WORKSPACE_ACCESS_DENIED");
    throw error;
  }
}

export async function promoteStudentGradesIfNeeded(user, date = new Date()) {
  if (!isBootstrapOwner(user)) return false;
  const promotionYear = getGradePromotionYear(date);
  const studentSnapshots = await getDocs(workspaceCollectionRef(COLLECTIONS.students));
  const studentRefs = studentSnapshots.docs.map((snapshot) => snapshot.ref);

  return runTransaction(db, async (transaction) => {
    const [workspaceSnapshot, ...students] = await Promise.all([
      transaction.get(workspaceRef()),
      ...studentRefs.map((reference) => transaction.get(reference)),
    ]);
    if (!workspaceSnapshot.exists()) throw new Error("找不到工作區。");
    const previousYear = Number(workspaceSnapshot.data().lastGradePromotionYear || promotionYear);
    if (previousYear >= promotionYear) return false;
    const years = promotionYear - previousYear;
    students.forEach((snapshot) => {
      if (!snapshot.exists()) return;
      transaction.update(snapshot.ref, {
        grade: Number(snapshot.data().grade || 0) + years,
        updatedAt: serverTimestamp(),
      });
    });
    transaction.update(workspaceRef(), {
      lastGradePromotionYear: promotionYear,
      updatedAt: serverTimestamp(),
    });
    return true;
  });
}
