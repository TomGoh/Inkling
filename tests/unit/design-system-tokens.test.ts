import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Design System CSS Tokens and Rules Verification", () => {
  const cssPath = path.resolve(__dirname, "../../src/App.css");
  const cssContent = fs.readFileSync(cssPath, "utf-8");

  it("defines foundational spatial and typography tokens in :root", () => {
    expect(cssContent).toContain("--ease: cubic-bezier(0.16, 1, 0.3, 1)");
    expect(cssContent).toContain("--duration-fast: 120ms");
    expect(cssContent).toContain("--editor-max-width: 800px");
    expect(cssContent).toContain("--editor-line-height: 1.75");
    expect(cssContent).toContain("--font-sans");
    expect(cssContent).toContain("--font-mono");
  });

  it("defines light theme color hierarchy tokens", () => {
    expect(cssContent).toContain("--bg-canvas: #ffffff");
    expect(cssContent).toContain("--bg-surface: #f6f8fa");
    expect(cssContent).toContain("--bg-elevated: #ffffff");
    expect(cssContent).toContain("--border-subtle: #e8ecf0");
    expect(cssContent).toContain("--accent: #0969da");
    expect(cssContent).toContain("--accent-subtle: rgba(9, 105, 218, 0.08)");
  });

  it("defines dark theme color hierarchy tokens", () => {
    expect(cssContent).toContain("--bg-canvas: #0d1117");
    expect(cssContent).toContain("--bg-surface: #11161d");
    expect(cssContent).toContain("--bg-elevated: #161b22");
    expect(cssContent).toContain("--border-subtle: #21262d");
    expect(cssContent).toContain("--accent: #2f81f7");
    expect(cssContent).toContain("--accent-subtle: rgba(47, 129, 247, 0.12)");
  });

  it("maintains consistent border-radius and shadow tokens", () => {
    expect(cssContent).toContain("--radius-sm: 4px");
    expect(cssContent).toContain("--radius-md: 6px");
    expect(cssContent).toContain("--radius-lg: 8px");
    expect(cssContent).toContain("--shadow-sm: 0 1px 3px");
    expect(cssContent).toContain("--shadow-md: 0 4px 12px");
    expect(cssContent).toContain("--shadow-lg: 0 12px 28px");
  });

  it("contains accessible focus-visible ring styles", () => {
    expect(cssContent).toContain(":focus-visible");
    expect(cssContent).toContain("--focus-ring");
  });
});
