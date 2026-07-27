import { onSnapshot } from "firebase/firestore";
import { groupScheduleEntries } from "../domain/schedule.js";
import { COLLECTIONS, workspaceCollectionRef } from "./firestore-paths.js";

const SUBSCRIBED_COLLECTIONS = [
  COLLECTIONS.students,
  COLLECTIONS.seasons,
  COLLECTIONS.scheduleEntries,
  COLLECTIONS.scheduleOverrides,
  COLLECTIONS.attendance,
  COLLECTIONS.billingCycles,
  COLLECTIONS.payments,
];

function snapshotDocuments(snapshot) {
  return snapshot.docs.map((document) => ({
    id: document.id,
    ...document.data(),
  }));
}

export function subscribeToWorkspaceData(onState, onError) {
  const data = Object.fromEntries(SUBSCRIBED_COLLECTIONS.map((name) => [name, []]));
  const metadata = Object.fromEntries(SUBSCRIBED_COLLECTIONS.map((name) => [
    name,
    { ready: false, fromCache: false, hasPendingWrites: false },
  ]));
  let revision = 0;

  const emit = () => {
    const ready = Object.values(metadata).every((value) => value.ready);
    onState({
      students: data.students,
      seasons: data.seasons,
      scheduleEntries: data.scheduleEntries,
      scheduleOverrides: data.scheduleOverrides,
      schedules: groupScheduleEntries(data.scheduleEntries),
      attendance: data.attendance,
      billingCycles: data.billingCycles,
      payments: data.payments,
      sync: {
        ready,
        revision,
        fromCache: Object.values(metadata).some((value) => value.fromCache),
        hasPendingWrites: Object.values(metadata).some((value) => value.hasPendingWrites),
      },
    });
  };

  const unsubscribers = SUBSCRIBED_COLLECTIONS.map((name) => onSnapshot(
    workspaceCollectionRef(name),
    { includeMetadataChanges: true },
    (snapshot) => {
      const isFirstSnapshot = !metadata[name].ready;
      if (isFirstSnapshot || snapshot.docChanges().length > 0) revision += 1;
      data[name] = snapshotDocuments(snapshot);
      metadata[name] = {
        ready: true,
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
      };
      emit();
    },
    onError,
  ));

  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}
