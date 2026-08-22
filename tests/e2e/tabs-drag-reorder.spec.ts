// E2E：多标签页拖拽与中键关闭
import { test, expect } from "@playwright/test";
import { openMockWorkspace, expandMockNotes, openFile } from "./helpers";

test.describe("多标签页交互扩展", () => {
  test.beforeEach(async ({ page }) => {
    await openMockWorkspace(page);
    await expandMockNotes(page);
  });

  test("中键点击 Tab 可以直接关闭标签页", async ({ page }) => {
    await openFile(page, "intro.md");
    await openFile(page, "readme.md");

    const tabs = page.locator(".tab");
    await expect(tabs).toHaveCount(2);

    // 中键点击第一个 tab (intro.md)
    await tabs.nth(0).click({ button: "middle" });

    // 应该只剩下 readme.md
    await expect(tabs).toHaveCount(1);
    await expect(tabs.nth(0)).toContainText("readme.md");
  });

  test("HTML5 原生拖拽事件触发 Tab 重新排序", async ({ page }) => {
    await openFile(page, "intro.md");
    await openFile(page, "readme.md");

    const tabs = page.locator(".tab");
    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(0)).toContainText("intro.md");
    await expect(tabs.nth(1)).toContainText("readme.md");

    // Playwright 使用 dragTo 进行原生拖拽
    await tabs.nth(0).dragTo(tabs.nth(1));

    await expect(tabs.nth(0)).toContainText("readme.md");
    await expect(tabs.nth(1)).toContainText("intro.md");
  });
});
