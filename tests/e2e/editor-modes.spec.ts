// E2E：专注模式
// 覆盖：设置面板切换、focus-mode CSS 类、当前块高亮装饰

import { test, expect } from "@playwright/test";
import { openMockWorkspace, openFile } from "./helpers";

// 专注模式开关在 .settings-row 内（checkbox 本身无文本，靠行的 hasText 定位）
function focusToggle(page: import("@playwright/test").Page) {
  return page
    .locator(".settings-row", { hasText: "专注模式" })
    .locator(".settings-toggle");
}

test.describe("专注模式", () => {
  test.beforeEach(async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
  });

  test("F1 开启专注模式后编辑器加 focus-mode 类", async ({ page }) => {
    const root = page.locator(".md-editor-root");
    // 默认无 focus-mode
    await expect(root).not.toHaveClass(/focus-mode/);

    // 打开设置面板（title 为"偏好设置 (Ctrl/Cmd+,)"，用 starts-with 精确匹配前缀）
    await page.locator('.topbar-btn[title^="偏好设置"]').click();
    await expect(page.locator(".settings-modal")).toBeVisible({ timeout: 5_000 });

    // 勾选专注模式（checkbox 可能被 label 遮挡，用 force）
    await focusToggle(page).check({ force: true });
    await page.waitForTimeout(300);

    // 编辑器根应有 focus-mode 类
    await expect(root).toHaveClass(/focus-mode/);
  });

  test("F2 关闭专注模式后移除 focus-mode 类", async ({ page }) => {
    const root = page.locator(".md-editor-root");

    // 先开启
    await page.locator('.topbar-btn[title^="偏好设置"]').click();
    await expect(page.locator(".settings-modal")).toBeVisible({ timeout: 5_000 });
    await focusToggle(page).check({ force: true });
    await page.waitForTimeout(300);
    await expect(root).toHaveClass(/focus-mode/);

    // 再取消勾选
    await focusToggle(page).uncheck({ force: true });
    await page.waitForTimeout(300);
    await expect(root).not.toHaveClass(/focus-mode/);
  });

  test("F3 专注模式下当前块有高亮装饰", async ({ page }) => {
    // 开启专注模式
    await page.locator('.topbar-btn[title^="偏好设置"]').click();
    await expect(page.locator(".settings-modal")).toBeVisible({ timeout: 5_000 });
    await focusToggle(page).check({ force: true });
    await page.waitForTimeout(300);

    // 关闭设置面板（点关闭按钮，设置面板无 Escape 监听）
    await page.locator(".settings-close").click();
    await expect(page.locator(".settings-modal")).toBeHidden({ timeout: 3_000 });
    await page.waitForTimeout(200);

    // 点击编辑器某个段落，应有 inkling-focused 装饰
    await page.locator(".ProseMirror p").first().click();
    await page.waitForTimeout(200);
    await expect(page.locator(".inkling-focused")).toBeVisible({ timeout: 5_000 });
  });
});
