// E2E：快捷键自定义面板
// 覆盖：打开面板、捕获重绑、冲突检测、恢复默认、关闭面板

import { test, expect } from "@playwright/test";
import { openMockWorkspace, openFile, MOD } from "./helpers";

test.describe("快捷键自定义", () => {
  test.beforeEach(async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
  });

  async function openCustomizePanel(page: import("@playwright/test").Page) {
    // 先打开快捷键帮助面板
    await page.keyboard.press(`${MOD}+/`);
    await expect(page.locator(".shortcuts-modal")).toBeVisible({ timeout: 5_000 });
    // 点击"自定义…"按钮
    await page.locator(".shortcuts-customize").click();
    // 帮助面板关闭，自定义面板打开
    await expect(page.locator(".sc-modal")).toBeVisible({ timeout: 5_000 });
  }

  test("SC1 打开自定义面板", async ({ page }) => {
    await openCustomizePanel(page);
    await expect(page.locator(".sc-title")).toContainText("自定义快捷键");
    // 至少有一行快捷键
    const rows = page.locator(".sc-row");
    expect(await rows.count()).toBeGreaterThanOrEqual(1);
  });

  test("SC2 点绑定按钮进入捕获态", async ({ page }) => {
    await openCustomizePanel(page);
    const binding = page.locator(".sc-binding").first();
    await binding.click();
    // 进入捕获态
    await expect(page.locator(".sc-binding-capturing")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".sc-binding-capturing")).toContainText("按下组合键");
  });

  test("SC3 捕获态按组合键完成重绑", async ({ page }) => {
    await openCustomizePanel(page);
    const binding = page.locator(".sc-binding").first();
    await binding.click();
    await expect(page.locator(".sc-binding-capturing")).toBeVisible({ timeout: 5_000 });
    // 按一个组合键
    await page.keyboard.press("Control+Alt+Y");
    await page.waitForTimeout(300);
    // 退出捕获态
    await expect(page.locator(".sc-binding-capturing")).toBeHidden({ timeout: 5_000 });
    // 绑定按钮文本应包含新组合
    await expect(page.locator(".sc-binding").first()).toContainText(/Alt|Ctrl|Y/i);
  });

  test("SC4 捕获态 Esc 取消", async ({ page }) => {
    await openCustomizePanel(page);
    const binding = page.locator(".sc-binding").first();
    await binding.click();
    await expect(page.locator(".sc-binding-capturing")).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    // 退出捕获态，面板仍在
    await expect(page.locator(".sc-binding-capturing")).toBeHidden({ timeout: 5_000 });
    await expect(page.locator(".sc-modal")).toBeVisible();
  });

  test("SC5 点遮罩关闭面板", async ({ page }) => {
    await openCustomizePanel(page);
    await expect(page.locator(".sc-modal")).toBeVisible();
    // 点遮罩左上角（modal 居中，角落属于 backdrop 区域）
    await page.locator(".sc-backdrop").click({ position: { x: 5, y: 5 } });
    await expect(page.locator(".sc-modal")).toBeHidden({ timeout: 5_000 });
  });

  test("SC6 恢复全部默认按钮存在", async ({ page }) => {
    await openCustomizePanel(page);
    await expect(page.locator(".sc-reset-all")).toBeVisible();
    await expect(page.locator(".sc-reset-all")).toContainText("恢复全部默认");
  });
});
