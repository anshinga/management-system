import {
  getCurrentUser,
  isAuthorizedUser,
  signInWithGoogle,
  signOut,
  subscribeToAuthState,
} from "./firebase/auth-service.js";

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

function startManagementSystem() {
  if (managementSystemPromise) return managementSystemPromise;

  managementSystemPromise = Promise.all([
    import("./router.js"),
    import("./store.js"),
    import("./views/roll-call.js"),
    import("./views/students.js"),
    import("./views/schedule.js"),
    import("./views/records.js"),
    import("./views/payment.js"),
  ]).then(([
    { initRouter },
    { getState },
    { renderRollCall, bindRollCall },
    { renderStudents, bindStudents },
    { renderSchedule, bindSchedule },
    { renderRecords },
    { renderPayment, bindPayment },
  ]) => {
    const app = document.querySelector("#app");
    let state = getState();
    let currentRoute = "roll-call";

    function showToast(message) {
      const toast = document.querySelector("#toast");
      toast.textContent = message;
      toast.classList.add("show");
      window.clearTimeout(showToast.timer);
      showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2200);
    }

    function refresh() {
      state = getState();
      app.innerHTML = currentRoute === "roll-call" ? renderRollCall(state, refresh) : currentRoute === "students" ? renderStudents(state) : currentRoute === "schedule" ? renderSchedule(state) : currentRoute === "records" ? renderRecords(state) : renderPayment(state);
      if (currentRoute === "roll-call") bindRollCall(app, state, refresh);
      if (currentRoute === "students") bindStudents(app, state, refresh, showToast);
      if (currentRoute === "schedule") bindSchedule(app, state, refresh);
      if (currentRoute === "payment") bindPayment(app, state, refresh, showToast);
      app.querySelector('[data-action="refresh"]')?.addEventListener("click", refresh);
    }

    initRouter((route) => { currentRoute = ["roll-call", "students", "schedule", "records", "payment"].includes(route) ? route : "roll-call"; refresh(); });
    document.querySelector("#theme-toggle").addEventListener("click", () => { document.body.classList.toggle("dark"); localStorage.setItem("mpm-theme", document.body.classList.contains("dark") ? "dark" : "light"); });
    if (localStorage.getItem("mpm-theme") === "dark") document.body.classList.add("dark");
  });

  return managementSystemPromise;
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
    await startManagementSystem();
    if (currentVersion === authStateVersion && isAuthorizedUser(getCurrentUser())) {
      showManagementSystem();
    }
  } catch (error) {
    console.error("管理系統初始化失敗", error);
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
