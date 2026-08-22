// E2E：分屏并排对照模式 (Split Pane)
// 覆盖：Tab 右键选择"在分屏打开"、左右双栏独立渲染、关闭分屏与左右交换

import { test, expect } from "@playwright/test";
import { openMockWorkspace, expandMockNotes, openFile } from "./helpers";

test.describe("分屏并排对照模式", () => {
  test.beforeEach(async ({ page }) => {
    await openMockWorkspace(page);
    await expandMockNotes(page);
  });

  test("通过 Tab 右键菜单选择'在分屏打开'并在两栏中独立渲染", async ({ page }) => {
    // 1. 打开两个文件：先打开 intro.md，再打开 readme.md（此时 readme.md 是主活动文件）
    await openFile(page, "intro.md");
    await openFile(page, "readme.md");

    // 2. 右键点击非活动 Tab (intro.md)
    const tabIntro = page.locator('.tab:has-text("intro.md")');
    await tabIntro.click({ button: "right" });

    // 3. 点击'在分屏打开'
    const splitMenuItem = page.locator('.tab-context-item:has-text("在分屏打开")');
    await expect(splitMenuItem).toBeVisible();
    await splitMenuItem.click();

    // 4. 验证出现分屏容器与右侧分屏
    const splitPane = page.locator(".split-pane");
    await expect(splitPane).toBeVisible();
    await expect(splitPane.locator(".topbar-file")).toHaveText("intro.md");

    // 5. 验证点击左右交换
    const swapBtn = splitPane.locator('button[title="左右交换"]');
    await expect(swapBtn).toBeVisible();
    await swapBtn.click();
    await expect(splitPane.locator(".topbar-file")).toHaveText("readme.md");

    // 6. 验证关闭分屏
    const closeSplitBtn = splitPane.locator('button[title="关闭分屏"]');
    await expect(closeSplitBtn).toBeVisible();
    await closeSplitBtn.click();

    // 验证分屏已关闭
    await expect(page.locator(".split-pane")).toHaveCount(0);
  });
});
