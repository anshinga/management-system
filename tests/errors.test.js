import { describe, expect, test } from "vitest";
import { getUserErrorMessage } from "../js/ui/errors.js";

describe("user-facing errors", () => {
  test("Firebase 權限錯誤不會直接顯示技術訊息", () => {
    expect(getUserErrorMessage({ code: "permission-denied" })).toBe("您沒有執行這項操作的權限。");
    expect(getUserErrorMessage({ code: "functions/permission-denied" }))
      .toBe("您沒有執行這項操作的權限。");
  });

  test("保留應用程式提供的可理解錯誤", () => {
    expect(getUserErrorMessage({ message: "只能刪除最新點名。" })).toBe("只能刪除最新點名。");
  });

  test("未知技術錯誤使用指定的備援訊息", () => {
    expect(getUserErrorMessage({ message: "FirebaseError: internal" }, "儲存失敗")).toBe("儲存失敗");
  });

  test("Firestore 缺少索引時顯示可理解的提示", () => {
    expect(getUserErrorMessage({
      code: "failed-precondition",
      message: "The query requires an index. You can create it here: create_composite",
    })).toBe("雲端排課索引尚未就緒，請稍後再試。");
  });
});
