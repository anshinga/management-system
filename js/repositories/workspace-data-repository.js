import { onSnapshot } from "firebase/firestore";
import { groupScheduleEntries } from "../domain/schedule.js";
import { COLLECTIONS, workspaceCollectionRef } from "./firestore-paths.js";

const CORE_COLLECTIONS = [
  COLLECTIONS.students,
  COLLECTIONS.seasons,
  COLLECTIONS.scheduleEntries,
  COLLECTIONS.scheduleOverrides,
  COLLECTIONS.attendance,
  COLLECTIONS.billingCycles,
  COLLECTIONS.payments,
];

const BOOKING_COLLECTIONS = [
  COLLECTIONS.bookingCampaigns,
  COLLECTIONS.bookingInvitations,
  COLLECTIONS.bookingSubmissions,
  COLLECTIONS.bookingSlotCounters,
];

function snapshotDocuments(snapshot) {
  return snapshot.docs.map((document) => ({
    id: document.id,
    ...document.data(),
  }));
}

export function subscribeToWorkspaceData(onState, onError, { includeBooking = false } = {}) {
  const subscribedCollections = includeBooking
    ? [...CORE_COLLECTIONS, ...BOOKING_COLLECTIONS]
    : CORE_COLLECTIONS;
  const data = Object.fromEntries(subscribedCollections.map((name) => [name, []]));
  const metadata = Object.fromEntries(subscribedCollections.map((name) => [
    name,
    { ready: false, fromCache: false, hasPendingWrites: false },
  ]));
  let revision = 0;
  let bookingError = null;

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
      bookingCampaigns: data.bookingCampaigns || [],
      bookingInvitations: data.bookingInvitations || [],
      bookingSubmissions: data.bookingSubmissions || [],
      bookingSlotCounters: data.bookingSlotCounters || [],
      booking: {
        available: includeBooking && bookingError == null,
        errorCode: bookingError?.code || "",
      },
      sync: {
        ready,
        revision,
        fromCache: Object.values(metadata).some((value) => value.fromCache),
        hasPendingWrites: Object.values(metadata).some((value) => value.hasPendingWrites),
      },
    });
  };

  const unsubscribers = subscribedCollections.map((name) => onSnapshot(
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
    (error) => {
      if (!BOOKING_COLLECTIONS.includes(name)) {
        onError(error);
        return;
      }
      bookingError = error;
      data[name] = [];
      metadata[name] = {
        ready: true,
        fromCache: false,
        hasPendingWrites: false,
      };
      revision += 1;
      emit();
    },
  ));

  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}
