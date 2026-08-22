// E2E：文件外部修改冲突对话框
// 覆盖：查看差异对比、丢弃本地修改并重载磁盘、继续编辑

import { test, expect } from "@playwright/test";
import { openMockWorkspace, openFile } from "./helpers";

test.describe("外部文件变动冲突对话框", () => {
  test.beforeEach(async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "intro.md");
  });

  test("触发冲突后可查看 Diff 视图并返回与继续编辑", async ({ page }) => {
    // 触发冲突 store
    await page.evaluate(() => {
      // @ts-ignore
      window.__triggerConflict?.({
        filePath: "/mock-workspace/intro.md",
        localContent: "# Local Hello World\nSome local changes",
        diskContent: "# Disk Hello World\nSome disk changes",
        detectedAt: Date.now(),
      });
    });

    // 检查冲突弹窗
    const dialog = page.locator('div[role="dialog"][aria-label="文件冲突"]');
    await expect(dialog).toBeVisible();

    // 点击查看差异对比
    await page.locator(".conflict-btn").filter({ hasText: "查看差异对比" }).click();
    await expect(page.locator('div[role="dialog"][aria-label="文件冲突差异对比"]')).toBeVisible();
    await expect(page.locator(".conflict-diff-line").first()).toBeVisible();

    // 返回选项
    await page.locator('button[aria-label="返回选项"]').click();
    await expect(dialog).toBeVisible();

    // 继续编辑
    await page.locator(".conflict-btn").filter({ hasText: "继续编辑" }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("丢弃本地修改并重载磁盘", async ({ page }) => {
    await page.evaluate(() => {
      // @ts-ignore
      window.__triggerConflict?.({
        filePath: "/mock-workspace/intro.md",
        localContent: "# Local Unsaved",
        diskContent: "# Remote Disk Saved",
        detectedAt: Date.now(),
      });
    });

    const dialog = page.locator('div[role="dialog"][aria-label="文件冲突"]');
    await expect(dialog).toBeVisible();

    // 点击丢弃本地修改
    await page.locator(".conflict-btn").filter({ hasText: "丢弃本地修改" }).click();
    await expect(dialog).toHaveCount(0);
  });
});
