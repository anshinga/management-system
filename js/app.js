import {
  getCurrentUser,
  isAuthorizedUser,
  signInWithGoogle,
  signOut,
  subscribeToAuthState,
} from "./firebase/auth-service.js";
import { createDailyRollCallReset } from "./daily-session.js";

const authGate = document.querySelector("#auth-gate");
const authTitle = document.querySelector("#auth-title");
const authMessage = document.querySelector("#auth-message");
const signInButton = document.querySelector("#google-sign-in");
const signOutButton = document.querySelector("#sign-out");
const managementSystem = document.querySelector("#management-system");

let accessDenied = false;
let authStateVersion = 0;
let authAction = "sign-in";
let managementSystemPromise;
let managementRuntime;

function showAuthGate({
  title,
  message,
  actionLabel = "",
  action = "sign-in",
  isBusy = false,
  isError = false,
}) {
  managementSystem.hidden = true;
  authGate.hidden = false;
  authGate.setAttribute("aria-busy", String(isBusy));
  authTitle.textContent = title;
  authMessage.textContent = message;
  authMessage.classList.toggle("is-error", isError);
  authAction = action;
  signInButton.hidden = !actionLabel;
  signInButton.disabled = false;
  if (actionLabel) signInButton.textContent = actionLabel;
  queueMicrotask(() => (actionLabel ? signInButton : authTitle).focus());
}

function showManagementSystem() {
  authGate.hidden = true;
  authGate.setAttribute("aria-busy", "false");
  managementSystem.hidden = false;
  queueMicrotask(() => document.querySelector("[data-route].is-active")?.focus());
}

function describeAuthError(error) {
  if (error?.code === "auth/popup-closed-by-user") return "登入視窗已關閉，請再試一次。";
  if (error?.code === "auth/popup-blocked") return "瀏覽器阻擋了登入視窗，請允許彈出式視窗後再試。";
  if (error?.code === "auth/cancelled-popup-request") return "前一個登入要求已取消，請再試一次。";
  if (error?.code === "auth/unauthorized-domain") return "目前網域尚未加入 Firebase Authorized domains。";
  if (error?.code === "auth/network-request-failed") return "網路連線失敗，請確認連線後再試。";
  if (error?.code?.startsWith("auth/api-key-not-valid")) return "Firebase API Key 無效，請重新確認 Web App 設定。";
  return "Google 登入失敗，請稍後再試。";
}

async function startManagementSystem(user) {
  if (!managementSystemPromise) {
    managementSystemPromise = Promise.all([
      import("./router.js"),
      import("./views/roll-call.js"),
      import("./views/students.js"),
      import("./views/schedule.js"),
      import("./views/analytics.js"),
      import("./views/records.js"),
      import("./views/payment.js"),
      import("./views/export-backup.js"),
      import("./views/booking-campaigns.js"),
      import("./repositories/workspace-data-repository.js"),
      import("./repositories/workspace-repository.js"),
      import("./store.js"),
    ]).then(([
      { initRouter },
      { renderRollCall, bindRollCall },
      { renderStudents, bindStudents },
      { renderSchedule, bindSchedule, getScheduleDataScope },
      { renderAnalytics, bindAnalytics, resetAnalyticsView },
      { renderRecords, bindRecords },
      { renderPayment, bindPayment },
      { renderExportBackup, bindExportBackup },
      { renderBookingCampaigns, bindBookingCampaigns },
      { subscribeToWorkspaceData },
      { ensureWorkspaceAccess, promoteStudentGradesIfNeeded },
      {
        beginDailySession,
        formatDate,
        getSelectedAttendanceDate,
        getTodayDate,
        getWeekStart,
        parseDate,
        setSelectedAttendanceDate,
      },
    ]) => {
      const app = document.querySelector("#app");
      const storageStatus = document.querySelector("#storage-status");
      let state = null;
      let currentRoute = "roll-call";
      let dataSubscription = null;
      let lastRenderedRevision = -1;
      let canManageBooking = false;
      const validRoutes = new Set([
        "roll-call",
        "students",
        "schedule",
        "analytics",
        "records",
        "payment",
        "export-backup",
        "booking",
      ]);

      function getCurrentDataScope() {
        if (currentRoute === "roll-call") {
          const dateKey = getSelectedAttendanceDate();
          return {
            route: currentRoute,
            dateKey,
            weekStart: formatDate(getWeekStart(parseDate(dateKey))),
          };
        }
        if (currentRoute === "schedule") return getScheduleDataScope();
        return { route: currentRoute };
      }

      function showToast(message) {
        const toast = document.querySelector("#toast");
        toast.textContent = message;
        toast.classList.add("show");
        window.clearTimeout(showToast.timer);
        showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 3200);
      }

      function updateStorageStatus() {
        if (!state?.sync?.ready) {
          storageStatus.textContent = "正在連線雲端";
          return;
        }
        if (state.sync.hasPendingWrites) {
          storageStatus.textContent = "正在同步變更";
          return;
        }
        storageStatus.textContent = state.sync.fromCache ? "離線快取資料" : "雲端已同步";
      }

      function refresh(force = true) {
        dataSubscription?.setScope(getCurrentDataScope());
        updateStorageStatus();
        if (!state?.sync?.ready) {
          app.innerHTML = '<div class="panel empty" aria-busy="true">正在載入雲端資料…</div>';
          return;
        }
        if (!force && lastRenderedRevision === state.sync.revision) return;
        lastRenderedRevision = state.sync.revision;
        app.innerHTML = currentRoute === "roll-call"
          ? renderRollCall(state)
          : currentRoute === "students"
            ? renderStudents(state)
            : currentRoute === "schedule"
              ? renderSchedule(state)
              : currentRoute === "analytics"
                ? renderAnalytics(state)
                : currentRoute === "records"
                  ? renderRecords(state)
                  : currentRoute === "payment"
                    ? renderPayment(state)
                    : currentRoute === "export-backup"
                      ? renderExportBackup(state)
                      : renderBookingCampaigns(state);
        if (currentRoute === "roll-call") bindRollCall(app, state, refresh, showToast);
        if (currentRoute === "students") bindStudents(app, state, refresh, showToast);
        if (currentRoute === "schedule") bindSchedule(app, state, refresh, showToast);
        if (currentRoute === "analytics") bindAnalytics(app, refresh);
        if (currentRoute === "records") bindRecords(app, state);
        if (currentRoute === "payment") bindPayment(app, state, refresh, showToast);
        if (currentRoute === "export-backup") bindExportBackup(app, state, refresh, showToast);
        if (currentRoute === "booking") bindBookingCampaigns(app, state, refresh, showToast);
        app.querySelector('[data-action="refresh"]')?.addEventListener("click", () => refresh(true));
      }

      function applyRoute(route) {
        currentRoute = validRoutes.has(route) ? route : "roll-call";
        document.querySelectorAll("[data-route]").forEach((button) => {
          button.classList.toggle("is-active", button.dataset.route === currentRoute);
        });
        refresh(true);
      }

      function replaceRouteHash(route) {
        if (location.hash === `#${route}`) return;
        window.history.replaceState(null, "", `#${route}`);
      }

      initRouter(applyRoute);
      const returnToTodayIfNewDay = createDailyRollCallReset({
        beginDailySession,
        getTodayDate,
        setSelectedAttendanceDate,
        replaceRoute: replaceRouteHash,
        applyRoute,
      });
      returnToTodayIfNewDay();
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") returnToTodayIfNewDay();
      });
      window.addEventListener("pageshow", returnToTodayIfNewDay);
      document.querySelector("#theme-toggle").addEventListener("click", () => {
        document.body.classList.toggle("dark");
        localStorage.setItem("mpm-theme", document.body.classList.contains("dark") ? "dark" : "light");
      });
      if (localStorage.getItem("mpm-theme") === "dark") document.body.classList.add("dark");

      return {
        async connect(authenticatedUser) {
          resetAnalyticsView();
          dataSubscription?.unsubscribe();
          dataSubscription = null;
          state = null;
          lastRenderedRevision = -1;
          refresh(true);
          const member = await ensureWorkspaceAccess(authenticatedUser);
          canManageBooking = ["owner", "teacher"].includes(member.role);
          const bookingRouteButton = document.querySelector('[data-route="booking"]');
          if (bookingRouteButton) bookingRouteButton.hidden = !canManageBooking;
          if (!canManageBooking && currentRoute === "booking") {
            currentRoute = "roll-call";
          }
          document.querySelectorAll("[data-route]").forEach((button) => {
            button.classList.toggle("is-active", button.dataset.route === currentRoute);
          });
          await promoteStudentGradesIfNeeded(authenticatedUser);
          await new Promise((resolve, reject) => {
            let settled = false;
            dataSubscription = subscribeToWorkspaceData((nextState) => {
              const shouldRender = state?.sync?.revision !== nextState.sync.revision;
              state = nextState;
              refresh(shouldRender);
              if (!settled && nextState.sync.ready) {
                settled = true;
                resolve();
              }
            }, (error) => {
              if (!settled) {
                settled = true;
                reject(error);
                return;
              }
              storageStatus.textContent = "雲端同步失敗";
              showToast("雲端同步中斷，請檢查網路後重新整理");
            }, {
              includeBooking: canManageBooking,
              initialScope: getCurrentDataScope(),
            });
          });
        },
        disconnect() {
          resetAnalyticsView();
          dataSubscription?.unsubscribe();
          dataSubscription = null;
          state = null;
          lastRenderedRevision = -1;
          storageStatus.textContent = "尚未連線";
        },
      };
    });
  }

  managementRuntime = await managementSystemPromise;
  await managementRuntime.connect(user);
}

async function handleSignIn() {
  const requestVersion = authStateVersion;
  accessDenied = false;
  showAuthGate({
    title: "正在開啟 Google 登入…",
    message: "請在彈出視窗中選擇帳號。",
    isBusy: true,
  });

  try {
    await signInWithGoogle();
  } catch (error) {
    if (requestVersion !== authStateVersion || isAuthorizedUser(getCurrentUser())) return;
    showAuthGate({
      title: "無法完成登入",
      message: describeAuthError(error),
      actionLabel: "重新使用 Google 登入",
      isError: true,
    });
  }
}

async function handleSignOut() {
  const requestVersion = authStateVersion;
  accessDenied = false;
  showAuthGate({
    title: "正在登出…",
    message: "請稍候。",
    isBusy: true,
  });

  try {
    await signOut();
  } catch (error) {
    if (requestVersion !== authStateVersion) return;
    console.error("Firebase 登出失敗", error);
    showAuthGate({
      title: "無法完成登出",
      message: "請確認網路連線後再試。",
      actionLabel: "重試登出",
      action: "sign-out",
      isError: true,
    });
  }
}

signInButton.addEventListener("click", () => {
  if (authAction === "sign-out") {
    handleSignOut();
    return;
  }
  handleSignIn();
});

signOutButton.addEventListener("click", handleSignOut);

subscribeToAuthState(async (user) => {
  const currentVersion = ++authStateVersion;

  if (!user) {
    managementRuntime?.disconnect();
    showAuthGate(accessDenied
      ? {
          title: "您沒有權限使用此系統",
          message: "請改用已授權的 Google 帳號。",
          actionLabel: "改用其他 Google 帳號",
          isError: true,
        }
      : {
          title: "登入管理系統",
          message: "請使用已授權的 Google 帳號登入。",
          actionLabel: "使用 Google 登入",
        });
    return;
  }

  if (!isAuthorizedUser(user)) {
    accessDenied = true;
    showAuthGate({
      title: "您沒有權限使用此系統",
      message: "正在安全登出未授權帳號。",
      isBusy: true,
      isError: true,
    });

    try {
      await signOut();
    } catch (error) {
      console.error("未授權帳號登出失敗", error);
      showAuthGate({
        title: "您沒有權限使用此系統",
        message: "無法自動登出，請確認網路連線後再試。",
        actionLabel: "重試登出",
        action: "sign-out",
        isError: true,
      });
    }
    return;
  }

  accessDenied = false;
  showAuthGate({
    title: "正在載入管理系統…",
    message: "登入驗證成功。",
    isBusy: true,
  });

  try {
    await startManagementSystem(user);
    if (currentVersion === authStateVersion && isAuthorizedUser(getCurrentUser())) {
      showManagementSystem();
    }
  } catch (error) {
    console.error("管理系統初始化失敗", error);
    if (error?.message === "WORKSPACE_ACCESS_DENIED" || error?.code === "permission-denied") {
      accessDenied = true;
      managementRuntime?.disconnect();
      try {
        await signOut();
      } catch (signOutError) {
        console.error("未授權帳號登出失敗", signOutError);
        showAuthGate({
          title: "您沒有權限使用此系統",
          message: "無法自動登出，請確認網路連線後再試。",
          actionLabel: "重試登出",
          action: "sign-out",
          isError: true,
        });
      }
      return;
    }
    showAuthGate({
      title: "系統載入失敗",
      message: "請重新整理頁面後再試。",
      isError: true,
    });
  }
}, (error) => {
  console.error("Firebase Authentication 初始化失敗", error);
  showAuthGate({
    title: "無法確認登入狀態",
    message: "請檢查網路連線與 Firebase 設定後重新整理頁面。",
    isError: true,
  });
});
