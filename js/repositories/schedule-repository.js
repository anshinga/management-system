import {
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { addDays, formatDate, getWeekStart, parseDate } from "../store.js";
import { makeScheduleEntryId, makeScheduleOverrideId } from "../domain/schedule.js";
import { db } from "../firebase/firestore.js";
import { COLLECTIONS, workspaceCollectionRef, workspaceDocumentRef } from "./firestore-paths.js";

function entryReference(entry) {
  return workspaceDocumentRef(COLLECTIONS.scheduleEntries, makeScheduleEntryId(entry));
}

function schedulePattern({ dateKey, slot }) {
  const date = parseDate(dateKey);
  const weekStartDate = getWeekStart(date);
  const sourceWeekday = Math.round((date.getTime() - weekStartDate.getTime()) / 86400000) + 1;
  return { sourceWeekday, sourceSlot: slot };
}

function overrideData({ dateKey, seasonId, studentId, slot }) {
  const weekStart = formatDate(getWeekStart(parseDate(dateKey)));
  return {
    weekStart,
    seasonId,
    studentId,
    ...schedulePattern({ dateKey, slot }),
  };
}

function overrideReference(value) {
  return workspaceDocumentRef(COLLECTIONS.scheduleOverrides, makeScheduleOverrideId(overrideData(value)));
}

function entryData({ studentId, seasonId, dateKey, slot }) {
  return { studentId, seasonId, dateKey, slot };
}

async function getFutureMoveOperations(studentId, sourceData, targetData) {
  if (!sourceData || sourceData.seasonId !== targetData.seasonId) return [];
  const currentWeekStart = getWeekStart(parseDate(sourceData.dateKey));
  const currentWeekEnd = formatDate(addDays(currentWeekStart, 6));
  const sourcePattern = schedulePattern(sourceData);
  const targetPattern = schedulePattern(targetData);
  if (sourcePattern.sourceWeekday === targetPattern.sourceWeekday
    && sourcePattern.sourceSlot === targetPattern.sourceSlot) return [];

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
      const pattern = schedulePattern(data);
      const weekStart = formatDate(getWeekStart(parseDate(data.dateKey)));
      return pattern.sourceWeekday === sourcePattern.sourceWeekday
        && pattern.sourceSlot === sourcePattern.sourceSlot
        && (!boundary || weekStart < boundary);
    })
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

  if (operations.length > 200) {
    throw new Error("未來排課筆數過多，請分段調整或聯絡系統管理員。");
  }
  return operations;
}

export async function moveScheduleEntry(studentId, source, target) {
  if (!studentId || !target?.dateKey || !target?.slot || !target?.seasonId) {
    throw new Error("缺少排課移動所需資料。");
  }

  const targetData = entryData({ studentId, ...target });
  const targetRef = entryReference(targetData);
  const sourceData = source ? entryData({ studentId, ...source }) : null;
  const sourceRef = sourceData ? entryReference(sourceData) : null;
  if (sourceRef?.path === targetRef.path) return;
  const sourceOverrideRef = sourceData ? overrideReference(sourceData) : null;
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

  const existingEntryIds = new Set(currentSnapshot.docs.map((snapshot) => snapshot.id));
  const overriddenPatterns = new Set(overrideSnapshot.docs.map((snapshot) => {
    const value = snapshot.data();
    return `${value.studentId}\u0000${value.sourceWeekday}\u0000${value.sourceSlot}`;
  }));
  const missingEntries = previousSnapshot.docs
    .map((snapshot) => snapshot.data())
    .map((entry) => ({
      studentId: entry.studentId,
      seasonId,
      dateKey: formatDate(addDays(parseDate(entry.dateKey), 7)),
      slot: entry.slot,
      sourcePattern: `${entry.studentId}\u0000${schedulePattern(entry).sourceWeekday}\u0000${entry.slot}`,
    }))
    .filter((entry) => !existingEntryIds.has(makeScheduleEntryId(entry))
      && !overriddenPatterns.has(entry.sourcePattern))
    .map(({ sourcePattern, ...entry }) => entry);

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
