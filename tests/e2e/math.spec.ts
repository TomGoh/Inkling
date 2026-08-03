// E2E：KaTeX 数学公式渲染
// 覆盖：行内公式、块级公式、.katex 渲染产物、data-value 属性

import { test, expect } from "@playwright/test";
import { openMockWorkspace, openFile } from "./helpers";

test.describe("数学公式", () => {
  test.beforeEach(async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "math-demo.md");
  });

  test("MA1 行内公式渲染 .katex", async ({ page }) => {
    const inline = page.locator(".math-inline");
    await expect(inline.first()).toBeVisible({ timeout: 10_000 });
    // KaTeX 渲染产物含 .katex
    await expect(inline.first().locator(".katex")).toBeVisible();
    const val = await inline.first().getAttribute("data-value");
    expect(val).toContain("E = mc^2");
  });

  test("MA2 块级公式渲染 .katex", async ({ page }) => {
    const block = page.locator(".math-display");
    await expect(block.first()).toBeVisible({ timeout: 10_000 });
    await expect(block.first().locator(".katex")).toBeVisible();
    const val = await block.first().getAttribute("data-value");
    expect(val).toContain("int_0^1");
  });

  test("MA3 行内公式在段落内", async ({ page }) => {
    await expect(page.locator(".math-inline")).toBeVisible({ timeout: 10_000 });
    // 行内公式应在 <p> 内，不是独立块
    const p = page.locator("p").filter({ has: page.locator(".math-inline") });
    await expect(p).toBeVisible();
  });

  test("MA4 块级公式是独立块", async ({ page }) => {
    await expect(page.locator(".math-display")).toBeVisible({ timeout: 10_000 });
    // 块级公式直接挂在 ProseMirror 下（不在段落内）
    const blockInRoot = page.locator(".ProseMirror > .math-display");
    await expect(blockInRoot).toBeVisible();
  });
});
