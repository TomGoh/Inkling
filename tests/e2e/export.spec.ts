// E2E：导出功能
// 覆盖：导出菜单、复制 Markdown、导出 HTML/大纲/PNG 下载、Word 降级 alert

import { test, expect } from "@playwright/test";
import { openMockWorkspace, openFile } from "./helpers";

test.describe("导出功能", () => {
  test.beforeEach(async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
  });

  test("E1 点击导出展开菜单", async ({ page }) => {
    await page.locator('.topbar-btn[title="导出"]').click();
    await expect(page.locator(".export-dropdown")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".export-item", { hasText: "复制为 Markdown" })).toBeVisible();
    await expect(page.locator(".export-item", { hasText: "导出 HTML" })).toBeVisible();
    await expect(page.locator(".export-item", { hasText: "导出 Word" })).toBeVisible();
    await expect(page.locator(".export-item", { hasText: "导出长图" })).toBeVisible();
  });

  test("E2 复制为 Markdown 写入剪贴板", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.locator('.topbar-btn[title="导出"]').click();
    await page.locator(".export-item", { hasText: "复制为 Markdown" }).click();
    await page.waitForTimeout(300);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain("Readme");
  });

  test("E3 导出 HTML 触发下载", async ({ page }) => {
    const downloadPromise = page.waitForEvent("download", { timeout: 10_000 });
    await page.locator('.topbar-btn[title="导出"]').click();
    await page.locator(".export-item", { hasText: "导出 HTML" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/readme\.html$/);
  });

  test("E4 导出大纲触发下载", async ({ page }) => {
    const downloadPromise = page.waitForEvent("download", { timeout: 10_000 });
    await page.locator('.topbar-btn[title="导出"]').click();
    await page.locator(".export-item", { hasText: "导出大纲" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/readme-outline\.md$/);
  });

  test("E5 导出长图 PNG 触发下载", async ({ page }) => {
    const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
    await page.locator('.topbar-btn[title="导出"]').click();
    await page.locator(".export-item", { hasText: "导出长图" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/readme\.png$/);
  });

  test("E6 导出 Word 浏览器端降级 alert", async ({ page }) => {
    // 先打开导出下拉菜单
    await page.locator('.topbar-btn[title="导出"]').click();
    await expect(page.locator(".export-dropdown")).toBeVisible({ timeout: 5_000 });
    // alert() 是同步阻塞的：必须在点击前注册 dialog 处理器自动 accept，
    // 否则 alert 会卡住页面导致 click() 永远不返回（waitForEvent 不会自动 dismiss）
    let dialogMessage = "";
    page.once("dialog", (d) => {
      dialogMessage = d.message();
      void d.accept();
    });
    await page.locator(".export-item", { hasText: "导出 Word" }).click();
    // alert 被 page.once 自动 accept 后页面恢复，轮询拿到的消息
    await expect
      .poll(() => dialogMessage, { timeout: 10_000 })
      .toContain("Word 导出仅在桌面端可用");
  });
});
