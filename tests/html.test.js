import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { escapeAttribute, escapeHtml } from "../js/ui/html.js";

const projectPath = fileURLToPath(new URL("../", import.meta.url));

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

describe("網站品牌圖示", () => {
  test.each([
    ["index.html", "安信佳點名系統"],
    ["booking.html", "安信佳上課時段登記"],
  ])("%s 使用安信佳標誌、favicon 與 iOS 圖示", (filename, title) => {
    const html = readFileSync(`${projectPath}${filename}`, "utf8");

    expect(html).toContain(`<title>${title}</title>`);
    expect(html).toContain("./assets/branding/anshinjia-logo.png");
    expect(html).toContain('rel="icon"');
    expect(html).toContain("./assets/branding/favicon-48.png");
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain("./assets/branding/apple-touch-icon.png");
  });

  test.each([
    "anshinjia-logo.png",
    "favicon-48.png",
    "apple-touch-icon.png",
  ])("品牌圖檔 %s 已存在", (filename) => {
    expect(existsSync(`${projectPath}assets/branding/${filename}`)).toBe(true);
  });
});
