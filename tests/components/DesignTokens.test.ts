import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

describe("UI/UX Design Tokens & Layout 验证", () => {
  it("错误色统一走 --danger 变量，不得硬编码（深色主题下 --danger 是 #f85149）", () => {
    // #228 复审 P3-③：.qo-error / .gs-error 曾硬编码 #cf222e，深色主题下偏暗；
    // 顺手对齐 .mermaid-error。此断言覆盖到具体文件，防止回退。
    const files = [
      "src/App.css",
      "src/components/GlobalSearch/GlobalSearchPanel.css",
      "src/components/QuickOpen/QuickOpenPanel.css",
    ];
    for (const rel of files) {
      const css = readFileSync(resolve(process.cwd(), rel), "utf8");
      // 先剥掉注释再扫描：注释里可能会出现这个色值的说明文字（例如「硬编码 #cf222e 会…」）
      const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
      const offenders = withoutComments
        .split("\n")
        .filter((line) => line.includes("#cf222e"))
        // 允许：变量定义本身，以及 var(--danger, #cf222e) 的回退值
        .filter(
          (line) =>
            !line.includes("--danger:") &&
            !line.includes("var(--danger") &&
            !line.includes("--callout-accent:"),
        );
      expect(offenders, `${rel} 仍有硬编码错误色：${offenders.join(" | ")}`).toEqual([]);
    }
  });

  it("CSS 变量体系规范验证", () => {
    const css = readFileSync(resolve(process.cwd(), "src/App.css"), "utf8");
    const tokens = [
      "--ease",
      "--duration",
      "--mono-font",
      "--radius-sm",
      "--radius-md",
      "--radius-lg",
      "--bg-elevated",
      "--bg-subtle",
      "--editor-bg",
      "--border",
      "--text",
      "--text-muted",
      "--accent",
      "--accent-hover",
      "--success",
      "--danger",
      "--ring",
    ];
    for (const token of tokens) {
      expect(css, `${token} should be declared in App.css`).toMatch(
        new RegExp(`${token.replace(/-/g, "\\-")}\\s*:`),
      );
    }
  });
});
