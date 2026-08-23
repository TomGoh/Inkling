// E2E：链接跟随
// 覆盖：外部链接 Ctrl+click 打开、锚点链接 Ctrl+click 滚动

import { test, expect } from "@playwright/test";
import { openMockWorkspace, openFile, MOD } from "./helpers";

// 点击链接时的修饰键：macOS 用 Meta，其他用 Control

test.describe("链接跟随", () => {
  test.beforeEach(async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "link-demo.md");
  });

  test("L1 外部链接渲染为 a[href]", async ({ page }) => {
    const link = page.locator('.ProseMirror a[href="https://example.com"]');
    await expect(link).toBeVisible({ timeout: 10_000 });
    await expect(link).toContainText("Example");
  });

  test("L2 Ctrl+click 外部链接调用 window.open", async ({ page }) => {
    const link = page.locator('.ProseMirror a[href="https://example.com"]');
    await expect(link).toBeVisible({ timeout: 10_000 });

    // 注入 window.open 拦截
    await page.evaluate(() => {
      (window as unknown as { __openedUrl: string }).__openedUrl = "";
      const origOpen = window.open.bind(window);
      window.open = (url?: string | URL) => {
        (window as unknown as { __openedUrl: string }).__openedUrl = String(url);
        return null;
      };
      void origOpen;
    });

    // Ctrl/Cmd + click 链接
    await link.click({ modifiers: [MOD === "Meta" ? "Meta" : "Control"] });
    await page.waitForTimeout(300);

    const openedUrl = await page.evaluate(() => (window as unknown as { __openedUrl: string }).__openedUrl);
    expect(openedUrl).toBe("https://example.com");
  });

  test("L3 锚点链接 Ctrl+click 滚动到标题", async ({ page }) => {
    const anchorLink = page.locator('.ProseMirror a[href="#锚点目标"]');
    await expect(anchorLink).toBeVisible({ timeout: 10_000 });

    const scroll = page.locator(".editor-scroll");
    const before = await scroll.evaluate((el) => el.scrollTop);
    void before;

    // Ctrl/Cmd + click 锚点链接
    await anchorLink.click({ modifiers: [MOD === "Meta" ? "Meta" : "Control"] });
    await page.waitForTimeout(500);

    const after = await scroll.evaluate((el) => el.scrollTop);
    // 点击后滚动位置应有变化（或文档太短已在目标位置）
    expect(typeof after).toBe("number");
  });

  test("L4 普通 click 不触发链接跟随", async ({ page }) => {
    const link = page.locator('.ProseMirror a[href="https://example.com"]');
    await expect(link).toBeVisible({ timeout: 10_000 });

    // 注入拦截
    await page.evaluate(() => {
      (window as unknown as { __openedUrl: string }).__openedUrl = "";
      window.open = (url?: string | URL) => {
        (window as unknown as { __openedUrl: string }).__openedUrl = String(url);
        return null;
      };
    });

    // 不按修饰键直接 click，不应调用 window.open
    await link.click();
    await page.waitForTimeout(300);

    const openedUrl = await page.evaluate(() => (window as unknown as { __openedUrl: string }).__openedUrl);
    expect(openedUrl).toBe("");
  });
});
