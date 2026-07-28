import {
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { addDays, formatDate, getWeekStart, parseDate } from "../store.js";
import {
  buildCarryForwardEntries,
  getSchedulePattern,
  makeScheduleEntryId,
  makeScheduleOverrideId,
} from "../domain/schedule.js";
import { db } from "../firebase/firestore.js";
import { COLLECTIONS, workspaceCollectionRef, workspaceDocumentRef } from "./firestore-paths.js";

function entryReference(entry) {
  return workspaceDocumentRef(COLLECTIONS.scheduleEntries, makeScheduleEntryId(entry));
}

function overrideData({ dateKey, seasonId, studentId, slot }) {
  const weekStart = formatDate(getWeekStart(parseDate(dateKey)));
  return {
    weekStart,
    seasonId,
    studentId,
    ...getSchedulePattern({ dateKey, slot }),
  };
}

function overrideReference(value) {
  return workspaceDocumentRef(COLLECTIONS.scheduleOverrides, makeScheduleOverrideId(overrideData(value)));
}

function entryData({ studentId, seasonId, dateKey, slot, temporary = false }) {
  return {
    studentId,
    seasonId,
    dateKey,
    slot,
    ...(temporary ? { temporary: true } : {}),
  };
}

async function getFuturePatternEntries(studentId, sourceData) {
  if (!sourceData || sourceData.temporary === true) return [];
  const currentWeekStart = getWeekStart(parseDate(sourceData.dateKey));
  const currentWeekEnd = formatDate(addDays(currentWeekStart, 6));
  const sourcePattern = getSchedulePattern(sourceData);

  const [futureEntries, futureOverrides] = await Promise.all([
    getDocs(query(
      workspaceCollectionRef(COLLECTIONS.scheduleEntries),
      where("studentId", "==", studentId),
      where("seasonId", "==", sourceData.seasonId),
      where("dateKey", ">", currentWeekEnd),
    )),
    getDocs(query(
      workspaceCollectionRef(COLLECTIONS.scheduleOverrides),
      where("studentId", "==", studentId),
      where("seasonId", "==", sourceData.seasonId),
      where("weekStart", ">", formatDate(currentWeekStart)),
    )),
  ]);

  const boundary = futureOverrides.docs
    .map((snapshot) => snapshot.data())
    .filter((value) => value.sourceWeekday === sourcePattern.sourceWeekday
      && value.sourceSlot === sourcePattern.sourceSlot)
    .map((value) => value.weekStart)
    .sort()[0] || null;

  const operations = futureEntries.docs
    .map((snapshot) => ({ snapshot, data: snapshot.data() }))
    .filter(({ data }) => {
      const pattern = getSchedulePattern(data);
      const weekStart = formatDate(getWeekStart(parseDate(data.dateKey)));
      return pattern.sourceWeekday === sourcePattern.sourceWeekday
        && pattern.sourceSlot === sourcePattern.sourceSlot
        && (!boundary || weekStart < boundary);
    });

  if (operations.length > 200) {
    throw new Error("未來排課筆數過多，請分段調整或聯絡系統管理員。");
  }
  return operations;
}

async function getFutureMoveOperations(studentId, sourceData, targetData) {
  if (!sourceData || sourceData.seasonId !== targetData.seasonId) return [];
  const sourcePattern = getSchedulePattern(sourceData);
  const targetPattern = getSchedulePattern(targetData);
  if (sourcePattern.sourceWeekday === targetPattern.sourceWeekday
    && sourcePattern.sourceSlot === targetPattern.sourceSlot) return [];

  return (await getFuturePatternEntries(studentId, sourceData))
    .map(({ snapshot, data }) => {
      const weekStart = getWeekStart(parseDate(data.dateKey));
      const target = {
        studentId,
        seasonId: targetData.seasonId,
        dateKey: formatDate(addDays(weekStart, targetPattern.sourceWeekday - 1)),
        slot: targetPattern.sourceSlot,
      };
      return {
        sourceRef: snapshot.ref,
        targetRef: entryReference(target),
        target,
      };
    });
}

export async function moveScheduleEntry(studentId, source, target) {
  if (!studentId || !target?.dateKey || !target?.slot || !target?.seasonId) {
    throw new Error("缺少排課移動所需資料。");
  }

  const sourceData = source ? entryData({ studentId, ...source }) : null;
  const targetData = entryData({
    studentId,
    ...target,
    temporary: sourceData?.temporary === true,
  });
  const targetRef = entryReference(targetData);
  const sourceRef = sourceData ? entryReference(sourceData) : null;
  if (sourceRef?.path === targetRef.path) return;
  const sourceOverrideRef = sourceData && sourceData.temporary !== true
    ? overrideReference(sourceData)
    : null;
  const futureOperations = await getFutureMoveOperations(studentId, sourceData, targetData);
  const references = [...new Map([
    targetRef,
    sourceRef,
    sourceOverrideRef,
    ...futureOperations.flatMap((operation) => [operation.sourceRef, operation.targetRef]),
  ]
    .filter(Boolean)
    .map((reference) => [reference.path, reference])).values()];

  await runTransaction(db, async (transaction) => {
    const snapshots = await Promise.all(references.map((reference) => transaction.get(reference)));
    const snapshotByPath = new Map(snapshots.map((snapshot) => [snapshot.ref.path, snapshot]));
    const targetSnapshot = snapshotByPath.get(targetRef.path);

    if (sourceRef && sourceRef.path !== targetRef.path) transaction.delete(sourceRef);
    if (!targetSnapshot.exists()) {
      transaction.set(targetRef, {
        ...targetData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    futureOperations.forEach((operation) => {
      const futureSource = snapshotByPath.get(operation.sourceRef.path);
      const futureTarget = snapshotByPath.get(operation.targetRef.path);
      if (!futureSource?.exists()) return;
      transaction.delete(operation.sourceRef);
      if (futureTarget?.exists()) return;
      transaction.set(operation.targetRef, {
        ...operation.target,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    if (!sourceOverrideRef) return;
    const overrideSnapshot = snapshotByPath.get(sourceOverrideRef.path);
    if (overrideSnapshot?.exists()) {
      transaction.update(sourceOverrideRef, { updatedAt: serverTimestamp() });
      return;
    }
    transaction.set(sourceOverrideRef, {
      ...overrideData(sourceData),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function removeScheduleEntry(studentId, source) {
  if (!studentId || !source?.dateKey || !source?.slot || !source?.seasonId) {
    throw new Error("缺少移除排課所需資料。");
  }

  const sourceData = entryData({ studentId, ...source });
  const sourceRef = entryReference(sourceData);
  const sourceOverrideRef = sourceData.temporary === true ? null : overrideReference(sourceData);
  const futureEntries = await getFuturePatternEntries(studentId, sourceData);
  const references = [...new Map([
    sourceRef,
    sourceOverrideRef,
    ...futureEntries.map(({ snapshot }) => snapshot.ref),
  ]
    .filter(Boolean)
    .map((reference) => [reference.path, reference])).values()];

  await runTransaction(db, async (transaction) => {
    const snapshots = await Promise.all(references.map((reference) => transaction.get(reference)));
    const snapshotByPath = new Map(snapshots.map((snapshot) => [snapshot.ref.path, snapshot]));

    if (snapshotByPath.get(sourceRef.path)?.exists()) transaction.delete(sourceRef);
    futureEntries.forEach(({ snapshot }) => {
      if (snapshotByPath.get(snapshot.ref.path)?.exists()) transaction.delete(snapshot.ref);
    });

    if (!sourceOverrideRef) return;
    const overrideSnapshot = snapshotByPath.get(sourceOverrideRef.path);
    if (overrideSnapshot?.exists()) {
      transaction.update(sourceOverrideRef, { updatedAt: serverTimestamp() });
      return;
    }
    transaction.set(sourceOverrideRef, {
      ...overrideData(sourceData),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function addTemporaryScheduleEntries(studentIds, target) {
  const uniqueStudentIds = [...new Set(studentIds)].filter(Boolean);
  if (!uniqueStudentIds.length || !target?.dateKey || !target?.slot || !target?.seasonId) {
    throw new Error("請選擇至少一位臨時學生。");
  }

  const entries = uniqueStudentIds.map((studentId) => entryData({
    studentId,
    ...target,
    temporary: true,
  }));
  const references = entries.map(entryReference);

  return runTransaction(db, async (transaction) => {
    const snapshots = await Promise.all(references.map((reference) => transaction.get(reference)));
    let addedCount = 0;
    snapshots.forEach((snapshot, index) => {
      if (snapshot.exists()) return;
      addedCount += 1;
      transaction.set(references[index], {
        ...entries[index],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    return addedCount;
  });
}

export async function ensureScheduleWeek(date, seasonId) {
  const weekStartDate = getWeekStart(typeof date === "string" ? parseDate(date) : date);
  const weekStart = formatDate(weekStartDate);
  const weekEnd = formatDate(addDays(weekStartDate, 6));
  const previousStart = formatDate(addDays(weekStartDate, -7));
  const previousEnd = formatDate(addDays(weekStartDate, -1));

  const entries = workspaceCollectionRef(COLLECTIONS.scheduleEntries);
  const overrides = workspaceCollectionRef(COLLECTIONS.scheduleOverrides);
  const [previousSnapshot, currentSnapshot, overrideSnapshot] = await Promise.all([
    getDocs(query(entries,
      where("seasonId", "==", seasonId),
      where("dateKey", ">=", previousStart),
      where("dateKey", "<=", previousEnd))),
    getDocs(query(entries,
      where("seasonId", "==", seasonId),
      where("dateKey", ">=", weekStart),
      where("dateKey", "<=", weekEnd))),
    getDocs(query(overrides,
      where("seasonId", "==", seasonId),
      where("weekStart", "==", weekStart))),
  ]);

  const missingEntries = buildCarryForwardEntries({
    previousEntries: previousSnapshot.docs.map((snapshot) => snapshot.data()),
    currentEntries: currentSnapshot.docs.map((snapshot) => snapshot.data()),
    overrides: overrideSnapshot.docs.map((snapshot) => snapshot.data()),
    seasonId,
  });

  if (!missingEntries.length) return false;

  const references = missingEntries.map(entryReference);
  await runTransaction(db, async (transaction) => {
    const snapshots = await Promise.all(references.map((reference) => transaction.get(reference)));
    snapshots.forEach((snapshot, index) => {
      if (snapshot.exists()) return;
      transaction.set(references[index], {
        ...missingEntries[index],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  });
  return true;
}
