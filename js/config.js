export const APP_CONFIG = Object.freeze({
  mode: "firestore",
  workspaceId: "mpm-main",
  workspaceName: "MPM 課程管理",
  timezone: "Asia/Taipei",
  schemaVersion: 1,
  ownerEmail: "anshinga79@gmail.com",
});

export const WEEKDAY_SCHEDULE_SLOTS = Object.freeze([
  "15:00",
  "16:30",
  "18:00",
  "19:30",
]);

export const SATURDAY_SCHEDULE_SLOTS = Object.freeze([
  "09:00",
  "10:30",
]);

export const ALL_SCHEDULE_SLOTS = Object.freeze([
  ...SATURDAY_SCHEDULE_SLOTS,
  ...WEEKDAY_SCHEDULE_SLOTS,
]);

// Keep the existing name as the weekday default for current callers.
export const SCHEDULE_SLOTS = WEEKDAY_SCHEDULE_SLOTS;
