const firebaseMessages = {
  "permission-denied": "您沒有執行這項操作的權限。",
  unauthenticated: "登入狀態已失效，請重新登入。",
  unavailable: "目前無法連線至雲端，請檢查網路後再試。",
  aborted: "資料剛被其他裝置更新，請再試一次。",
  "failed-precondition": "資料狀態已改變，請重新整理後再試。",
  "resource-exhausted": "操作過於頻繁，請稍後再試。",
};

export function getUserErrorMessage(error, fallback = "操作失敗，請稍後再試。") {
  const code = String(error?.code || "").split("/").pop();
  if (code === "failed-precondition"
    && typeof error?.message === "string"
    && /index|create_composite/i.test(error.message)) {
    return "雲端排課索引尚未就緒，請稍後再試。";
  }
  if (firebaseMessages[code]) return firebaseMessages[code];
  if (typeof error?.message === "string" && error.message && !error.message.startsWith("FirebaseError:")) {
    return error.message;
  }
  return fallback;
}
