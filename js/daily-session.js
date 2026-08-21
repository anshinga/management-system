export function createDailyRollCallReset({
  beginDailySession,
  getTodayDate,
  setSelectedAttendanceDate,
  replaceRoute,
  applyRoute,
}) {
  return function returnToTodayIfNewDay() {
    const todayDate = getTodayDate();
    if (!beginDailySession(todayDate)) return false;
    setSelectedAttendanceDate(todayDate);
    replaceRoute("roll-call");
    applyRoute("roll-call");
    return true;
  };
}
