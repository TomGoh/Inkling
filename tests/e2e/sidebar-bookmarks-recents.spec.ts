// E2E：侧边栏书签与最近打开文件交互
// 覆盖：树节点右键添加书签、书签展示、取消书签、最近打开列表及切换

import { test, expect } from "@playwright/test";
import { openMockWorkspace, expandMockNotes, openFile } from "./helpers";

test.describe("侧边栏书签与最近打开", () => {
  test.beforeEach(async ({ page }) => {
    await openMockWorkspace(page);
    await expandMockNotes(page);
  });

  test("通过树节点右键添加和取消书签", async ({ page }) => {
    const readmeNode = page.locator('[data-tree-row][data-path="/mock-workspace/notes/readme.md"]');
    await readmeNode.click({ button: "right" });

    // 点击加入书签
    const bookmarkBtn = page.locator(".tree-context-item").filter({ hasText: "加入书签" });
    await bookmarkBtn.click();

    // 验证侧边栏书签区域出现 readme.md
    const bookmarkSection = page.locator(".recent-section").filter({ hasText: "书签" });
    await expect(bookmarkSection).toBeVisible();
    await expect(bookmarkSection.getByText("readme.md")).toBeVisible();

    // 点击取消书签小叉号
    const removeBtn = bookmarkSection.locator('button[title="取消书签"]');
    await removeBtn.click();

    // 验证书签区域消失或不再包含 readme.md
    await expect(bookmarkSection).toHaveCount(0);
  });

  test("打开文件后自动记录到最近打开并可通过最近打开切回", async ({ page }) => {
    await openFile(page, "intro.md");
    await openFile(page, "todo.md");

    const recentSection = page.locator(".recent-section").filter({ hasText: "最近打开" });
    await expect(recentSection).toBeVisible();
    await expect(recentSection.getByText("intro.md")).toBeVisible();
    await expect(recentSection.getByText("todo.md")).toBeVisible();

    // 从最近打开列表中点击 intro.md
    await recentSection.getByText("intro.md").click();
    await expect(page.locator(".tab.tab-active")).toContainText("intro.md");
  });
});
