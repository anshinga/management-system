import {
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { groupScheduleEntries } from "../domain/schedule.js";
import { COLLECTIONS, workspaceCollectionRef } from "./firestore-paths.js";

const BASE_COLLECTIONS = [
  COLLECTIONS.students,
  COLLECTIONS.seasons,
  COLLECTIONS.billingCycles,
];

const ROUTE_COLLECTIONS = [
  COLLECTIONS.scheduleEntries,
  COLLECTIONS.scheduleOverrides,
  COLLECTIONS.attendance,
  COLLECTIONS.leaveRecords,
  COLLECTIONS.payments,
  COLLECTIONS.bookingCampaigns,
  COLLECTIONS.bookingInvitations,
  COLLECTIONS.bookingSubmissions,
  COLLECTIONS.bookingSlotCounters,
];

const BOOKING_COLLECTIONS = [
  COLLECTIONS.bookingCampaigns,
  COLLECTIONS.bookingInvitations,
  COLLECTIONS.bookingSubmissions,
];

function snapshotDocuments(snapshot) {
  return snapshot.docs.map((document) => ({
    id: document.id,
    ...document.data(),
  }));
}

function collectionQuery(name, ...constraints) {
  const reference = workspaceCollectionRef(name);
  return constraints.length ? query(reference, ...constraints) : reference;
}

function dateRangeConstraints(startDate, endDate) {
  return [
    where("dateKey", ">=", startDate),
    where("dateKey", "<=", endDate),
  ];
}

function routeSubscriptions(scope, includeBooking) {
  if (scope.route === "roll-call") {
    return [
      {
        name: COLLECTIONS.scheduleEntries,
        reference: collectionQuery(COLLECTIONS.scheduleEntries, where("dateKey", "==", scope.dateKey)),
      },
      {
        name: COLLECTIONS.scheduleOverrides,
        reference: collectionQuery(COLLECTIONS.scheduleOverrides, where("weekStart", "==", scope.weekStart)),
      },
      {
        name: COLLECTIONS.attendance,
        reference: collectionQuery(COLLECTIONS.attendance, where("dateKey", "==", scope.dateKey)),
      },
      {
        name: COLLECTIONS.leaveRecords,
        reference: collectionQuery(COLLECTIONS.leaveRecords, where("dateKey", "==", scope.dateKey)),
      },
    ];
  }

  if (scope.route === "schedule") {
    const dateConstraints = dateRangeConstraints(scope.startDate, scope.endDate);
    return [
      {
        name: COLLECTIONS.scheduleEntries,
        reference: collectionQuery(COLLECTIONS.scheduleEntries, ...dateConstraints),
      },
      {
        name: COLLECTIONS.scheduleOverrides,
        reference: collectionQuery(COLLECTIONS.scheduleOverrides, where("weekStart", "==", scope.weekStart)),
      },
      {
        name: COLLECTIONS.attendance,
        reference: collectionQuery(COLLECTIONS.attendance, ...dateRangeConstraints(scope.startDate, scope.endDate)),
      },
      {
        name: COLLECTIONS.leaveRecords,
        reference: collectionQuery(COLLECTIONS.leaveRecords, ...dateRangeConstraints(scope.startDate, scope.endDate)),
      },
    ];
  }

  if (scope.route === "analytics") {
    return [];
  }

  if (scope.route === "records") {
    return [{
      name: COLLECTIONS.attendance,
      reference: collectionQuery(COLLECTIONS.attendance),
    }];
  }

  if (scope.route === "export-backup") {
    return [
      COLLECTIONS.scheduleEntries,
      COLLECTIONS.scheduleOverrides,
      COLLECTIONS.attendance,
    ].map((name) => ({ name, reference: collectionQuery(name) }));
  }

  if (scope.route === "booking" && includeBooking) {
    return BOOKING_COLLECTIONS.map((name) => ({
      name,
      reference: collectionQuery(name),
    }));
  }

  return [];
}

function normalizedScope(scope = {}) {
  const route = String(scope.route || "roll-call");
  if (route === "roll-call") {
    return {
      route,
      dateKey: String(scope.dateKey || ""),
      weekStart: String(scope.weekStart || ""),
    };
  }
  if (route === "schedule") {
    return {
      route,
      startDate: String(scope.startDate || ""),
      endDate: String(scope.endDate || ""),
      weekStart: String(scope.weekStart || scope.startDate || ""),
    };
  }
  return { route };
}

export function subscribeToWorkspaceData(
  onState,
  onError,
  { includeBooking = false, initialScope = {} } = {},
) {
  const allCollections = [...BASE_COLLECTIONS, ...ROUTE_COLLECTIONS];
  const data = Object.fromEntries(allCollections.map((name) => [name, []]));
  const baseMetadata = Object.fromEntries(BASE_COLLECTIONS.map((name) => [
    name,
    { ready: false, fromCache: false, hasPendingWrites: false },
  ]));
  let routeMetadata = {};
  let routeUnsubscribers = [];
  let routeScopeKey = "";
  let routeGeneration = 0;
  let revision = 0;
  let bookingError = null;
  let disposed = false;

  const emit = () => {
    if (disposed) return;
    const metadata = { ...baseMetadata, ...routeMetadata };
    const ready = Object.values(metadata).every((value) => value.ready);
    onState({
      students: data.students,
      seasons: data.seasons,
      scheduleEntries: data.scheduleEntries,
      scheduleOverrides: data.scheduleOverrides,
      schedules: groupScheduleEntries(data.scheduleEntries, data.scheduleOverrides),
      attendance: data.attendance,
      leaveRecords: data.leaveRecords,
      billingCycles: data.billingCycles,
      payments: data.payments,
      bookingCampaigns: data.bookingCampaigns,
      bookingInvitations: data.bookingInvitations,
      bookingSubmissions: data.bookingSubmissions,
      bookingSlotCounters: data.bookingSlotCounters,
      booking: {
        available: includeBooking && bookingError == null,
        errorCode: bookingError?.code || "",
      },
      sync: {
        ready,
        revision,
        scopeKey: routeScopeKey,
        fromCache: Object.values(metadata).some((value) => value.fromCache),
        hasPendingWrites: Object.values(metadata).some((value) => value.hasPendingWrites),
      },
    });
  };

  const subscribe = (
    { name, reference },
    metadataTarget,
    { booking = false, generation = null } = {},
  ) => onSnapshot(
    reference,
    { includeMetadataChanges: true },
    (snapshot) => {
      if (disposed || (generation !== null && generation !== routeGeneration)) return;
      const isFirstSnapshot = !metadataTarget[name].ready;
      if (isFirstSnapshot || snapshot.docChanges().length > 0) revision += 1;
      data[name] = snapshotDocuments(snapshot);
      metadataTarget[name] = {
        ready: true,
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
      };
      emit();
    },
    (error) => {
      if (disposed || (generation !== null && generation !== routeGeneration)) return;
      if (!booking) {
        onError(error);
        return;
      }
      bookingError = error;
      data[name] = [];
      metadataTarget[name] = {
        ready: true,
        fromCache: false,
        hasPendingWrites: false,
      };
      revision += 1;
      emit();
    },
  );

  const baseUnsubscribers = BASE_COLLECTIONS.map((name) => subscribe(
    { name, reference: collectionQuery(name) },
    baseMetadata,
  ));

  const setScope = (nextScope) => {
    if (disposed) return false;
    const scope = normalizedScope(nextScope);
    const nextScopeKey = JSON.stringify(scope);
    if (nextScopeKey === routeScopeKey) return false;

    routeUnsubscribers.forEach((unsubscribe) => unsubscribe());
    routeUnsubscribers = [];
    routeGeneration += 1;
    ROUTE_COLLECTIONS.forEach((name) => { data[name] = []; });
    routeMetadata = {};
    bookingError = null;
    routeScopeKey = nextScopeKey;
    revision += 1;

    const subscriptions = routeSubscriptions(scope, includeBooking);
    subscriptions.forEach(({ name }) => {
      routeMetadata[name] = {
        ready: false,
        fromCache: false,
        hasPendingWrites: false,
      };
    });
    emit();
    routeUnsubscribers = subscriptions.map((subscription) => subscribe(
      subscription,
      routeMetadata,
      {
        booking: BOOKING_COLLECTIONS.includes(subscription.name),
        generation: routeGeneration,
      },
    ));
    return true;
  };

  setScope(initialScope);

  return {
    setScope,
    unsubscribe() {
      if (disposed) return;
      disposed = true;
      baseUnsubscribers.forEach((unsubscribe) => unsubscribe());
      routeUnsubscribers.forEach((unsubscribe) => unsubscribe());
      routeUnsubscribers = [];
    },
  };
}
