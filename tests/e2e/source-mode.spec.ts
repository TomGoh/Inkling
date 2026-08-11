// E2E：源代码模式（issue #19）

import { test, expect } from "@playwright/test";
import { openMockWorkspace, openFile, MOD } from "./helpers";

test.describe("源代码模式", () => {
  test.beforeEach(async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
  });

  test("SM1 顶栏按钮切换源码模式", async ({ page }) => {
    const btn = page.locator('.topbar-btn[title*="源代码模式"]');
    await btn.click();
    await expect(page.getByTestId("source-mode-editor")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".ProseMirror")).toBeHidden();
    await btn.click();
    await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("source-mode-editor")).toBeHidden();
  });

  test("SM2 快捷键 Ctrl+Alt+S 切换", async ({ page }) => {
    await page.keyboard.press(`${MOD}+Alt+KeyS`);
    await expect(page.getByTestId("source-mode-editor")).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press(`${MOD}+Alt+KeyS`);
    await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 5_000 });
  });

  test("SM3 源码模式编辑会标记未保存", async ({ page }) => {
    await page.locator('.topbar-btn[title*="源代码模式"]').click();
    await expect(page.getByTestId("source-mode-editor")).toBeVisible({ timeout: 5_000 });
    await page.getByTestId("source-mode-editor").locator(".cm-content").click();
    await page.keyboard.type("# source mode edit");
    await expect(page.getByText("未保存")).toBeVisible({ timeout: 5_000 });
  });

  test("SM4 callout 往返", async ({ page }) => {
    await openFile(page, "callout-demo.md");
    await page.locator('.topbar-btn[title*="源代码模式"]').click();
    await expect(page.getByTestId("source-mode-editor").locator(".cm-content")).toContainText("[!", { timeout: 5_000 });
    await page.locator('.topbar-btn[title*="源代码模式"]').click();
    await expect(page.locator(".callout-block").first()).toBeVisible({ timeout: 5_000 });
  });
});
