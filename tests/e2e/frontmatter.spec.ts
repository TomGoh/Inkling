// E2E：YAML Front Matter 渲染
// 覆盖：frontmatter 块渲染、标签、CodeMirror 编辑器、data-value 属性

import { test, expect } from "@playwright/test";
import { openMockWorkspace, openFile } from "./helpers";

test.describe("Front Matter", () => {
  test.beforeEach(async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "frontmatter-demo.md");
  });

  test("FM1 frontmatter 块渲染", async ({ page }) => {
    const block = page.locator(".frontmatter-block");
    await expect(block).toBeVisible({ timeout: 10_000 });
    // data-value 持有原始 YAML 文本
    const val = await block.getAttribute("data-value");
    expect(val).toContain("title: 测试文档");
    expect(val).toContain("tags:");
  });

  test("FM2 标签显示 YAML Front Matter", async ({ page }) => {
    await expect(page.locator(".frontmatter-label")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".frontmatter-label")).toContainText("YAML Front Matter");
  });

  test("FM3 内嵌 CodeMirror 编辑器", async ({ page }) => {
    await expect(page.locator(".frontmatter-block .cm-editor")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".frontmatter-block .cm-content")).toBeVisible();
  });

  test("FM4 frontmatter 在文档最顶部", async ({ page }) => {
    await expect(page.locator(".frontmatter-block")).toBeVisible({ timeout: 10_000 });
    // frontmatter 应直接挂在 ProseMirror 下（块句柄 widget 是 span，frontmatter 是 div）
    const fmInRoot = page.locator(".ProseMirror > .frontmatter-block");
    await expect(fmInRoot).toBeVisible();
    // 在 frontmatter 之前不应有其他内容节点（排除 ProseMirror-widget 装饰）
    const beforeFm = await page.evaluate(() => {
      const pm = document.querySelector(".ProseMirror");
      if (!pm) return [];
      const els = Array.from(pm.children);
      const fmIdx = els.findIndex((e) => e.classList.contains("frontmatter-block"));
      if (fmIdx < 0) return [];
      return els
        .slice(0, fmIdx)
        .filter((e) => !e.classList.contains("ProseMirror-widget"))
        .map((e) => e.className);
    });
    expect(beforeFm).toEqual([]);
  });
});
