import {
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { validateAnalyticsDateRange } from "../domain/analytics.js";
import { COLLECTIONS, workspaceCollectionRef } from "./firestore-paths.js";

const attendanceCache = new Map();

function cacheKey(startDate, endDate) {
  return `${startDate}__${endDate}`;
}

function snapshotDocuments(snapshot) {
  return snapshot.docs.map((document) => ({
    id: document.id,
    ...document.data(),
  }));
}

export function clearAttendanceAnalyticsCache() {
  attendanceCache.clear();
}

export async function getAttendanceAnalyticsRecords(
  { startDate, endDate },
  { force = false } = {},
) {
  validateAnalyticsDateRange(startDate, endDate);
  const key = cacheKey(startDate, endDate);
  if (!force && attendanceCache.has(key)) {
    return {
      ...attendanceCache.get(key),
      fromMemoryCache: true,
    };
  }

  const snapshot = await getDocs(query(
    workspaceCollectionRef(COLLECTIONS.attendance),
    where("dateKey", ">=", startDate),
    where("dateKey", "<=", endDate),
  ));
  const result = {
    records: snapshotDocuments(snapshot),
    readCount: snapshot.docs.length,
    fetchedAt: new Date(),
  };
  attendanceCache.set(key, result);
  return {
    ...result,
    fromMemoryCache: false,
  };
}
