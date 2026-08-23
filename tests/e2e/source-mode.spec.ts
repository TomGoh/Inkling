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

  test("SM5 编辑后立即切换源码模式不丢失防抖窗口内的输入", async ({ page }) => {
    // 回归：publisher 序列化防抖 150ms，切换瞬间 store 若落后于 PM doc，
    // 源码模式会用旧内容播种并永久丢失最近编辑（PR #34 review P1）
    await page.locator(".ProseMirror").click();
    await page.keyboard.type("即时切换不丢字");
    // 不等防抖，立即切换
    await page.keyboard.press(`${MOD}+Alt+KeyS`);
    await expect(
      page.getByTestId("source-mode-editor").locator(".cm-content"),
    ).toContainText("即时切换不丢字", { timeout: 5_000 });
    // 往返回 WYSIWYG 内容仍在
    await page.keyboard.press(`${MOD}+Alt+KeyS`);
    await expect(page.locator(".ProseMirror")).toContainText("即时切换不丢字", {
      timeout: 5_000,
    });
  });

  test("SM4 callout 往返", async ({ page }) => {
    await openFile(page, "callout-demo.md");
    await page.locator('.topbar-btn[title*="源代码模式"]').click();
    await expect(page.getByTestId("source-mode-editor").locator(".cm-content")).toContainText("[!", { timeout: 5_000 });
    await page.locator('.topbar-btn[title*="源代码模式"]').click();
    await expect(page.locator(".callout-block").first()).toBeVisible({ timeout: 5_000 });
  });

  test("SM6 源码模式下大纲面板正常解析标题并支持点击跳转", async ({ page }) => {
    await openFile(page, "outline-demo.md");
    // 确保大纲面板可见
    const panel = page.locator(".outline-panel");
    if (!(await panel.isVisible().catch(() => false))) {
      await page.keyboard.press(`${MOD}+'`);
      await expect(panel).toBeVisible({ timeout: 5_000 });
    }

    // 切换至源码模式
    await page.keyboard.press(`${MOD}+Alt+KeyS`);
    await expect(page.getByTestId("source-mode-editor")).toBeVisible({ timeout: 5_000 });

    // 大纲项依然存在且与文档结构对应
    const outlineItems = panel.locator(".outline-item");
    await expect(outlineItems.first()).toBeVisible({ timeout: 5_000 });
    expect(await outlineItems.count()).toBe(3);

    // 点击三级标题大纲项跳转并激活
    const thirdItem = outlineItems.nth(2);
    await thirdItem.click();
    await expect(thirdItem).toHaveClass(/active/, { timeout: 5_000 });
  });
});
