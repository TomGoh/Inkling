import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

describe("UI/UX Design Tokens & Layout 验证", () => {
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
