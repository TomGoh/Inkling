// E2E：多标签页扩展操作与上下文菜单
// 覆盖：右键关闭其他、关闭右侧、全部关闭、复制路径

import { test, expect } from "@playwright/test";
import { openMockWorkspace, expandMockNotes, openFile } from "./helpers";

test.describe("多标签页操作与右键菜单", () => {
  test.beforeEach(async ({ page }) => {
    await openMockWorkspace(page);
    await expandMockNotes(page);
  });

  test("打开多个标签页并验证切换", async ({ page }) => {
    await openFile(page, "intro.md");
    await openFile(page, "readme.md");
    await openFile(page, "todo.md");

    const tabs = page.locator(".tab");
    await expect(tabs).toHaveCount(3);
    await expect(page.locator(".tab.tab-active")).toContainText("todo.md");

    // 点击 intro.md 切换
    await page.locator(".tab").filter({ hasText: "intro.md" }).click();
    await expect(page.locator(".tab.tab-active")).toContainText("intro.md");
  });

  test("右键菜单 - 关闭其他标签页", async ({ page }) => {
    await openFile(page, "intro.md");
    await openFile(page, "readme.md");
    await openFile(page, "todo.md");

    // 在 readme.md 标签上右键
    const readmeTab = page.locator(".tab").filter({ hasText: "readme.md" });
    await readmeTab.click({ button: "right" });
    await expect(page.locator(".tab-context-menu")).toBeVisible();

    await page.locator(".tab-context-item").filter({ hasText: "关闭其他" }).click();
    await expect(page.locator(".tab")).toHaveCount(1);
    await expect(page.locator(".tab.tab-active")).toContainText("readme.md");
  });

  test("右键菜单 - 关闭右侧标签页", async ({ page }) => {
    await openFile(page, "intro.md");
    await openFile(page, "readme.md");
    await openFile(page, "todo.md");

    // 在 readme.md 标签上右键，关闭右侧 (todo.md)
    const readmeTab = page.locator(".tab").filter({ hasText: "readme.md" });
    await readmeTab.click({ button: "right" });
    await page.locator(".tab-context-item").filter({ hasText: "关闭右侧" }).click();

    await expect(page.locator(".tab")).toHaveCount(2);
    await expect(page.locator(".tab").filter({ hasText: "todo.md" })).toHaveCount(0);
    await expect(page.locator(".tab").filter({ hasText: "intro.md" })).toBeVisible();
    await expect(page.locator(".tab").filter({ hasText: "readme.md" })).toBeVisible();
  });

  test("右键菜单 - 全部关闭", async ({ page }) => {
    await openFile(page, "intro.md");
    await openFile(page, "readme.md");

    const introTab = page.locator(".tab").filter({ hasText: "intro.md" });
    await introTab.click({ button: "right" });
    await page.locator(".tab-context-item").filter({ hasText: "全部关闭" }).click();

    await expect(page.locator(".tab")).toHaveCount(0);
    await expect(page.locator(".empty-state")).toBeVisible();
  });

  test("右键菜单 - 复制路径", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await openFile(page, "intro.md");

    const introTab = page.locator(".tab").filter({ hasText: "intro.md" });
    await introTab.click({ button: "right" });
    await page.locator(".tab-context-item").filter({ hasText: "复制路径" }).click();
    await page.waitForTimeout(300);

    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain("intro.md");
  });
});
