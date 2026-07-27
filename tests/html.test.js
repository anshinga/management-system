import { describe, expect, test } from "vitest";
import { escapeAttribute, escapeHtml } from "../js/ui/html.js";

describe("HTML escaping", () => {
  test("學生姓名中的標記不會被當成 HTML", () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">'))
      .toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  test("屬性值中的引號會被編碼", () => {
    expect(escapeAttribute(`王小明' "測試"`))
      .toBe("王小明&#039; &quot;測試&quot;");
  });
});
