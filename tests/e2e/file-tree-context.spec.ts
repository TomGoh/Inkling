// E2E：文件树右键菜单
// 覆盖：目录/文件右键菜单项、新建文件、重命名、删除确认、书签、复制路径
//
// 注意：书签区块也在 .sidebar-tree 内（recent-section），加入书签后同名文件会出现
// 两处（树节点 + 书签条目）。树节点是 <button>，书签条目是 <div>，
// 用 button.tree-row-file / button.tree-row-dir 限定到树节点，避免误点书签条目。

import { test, expect, type Page } from "@playwright/test";
import { openMockWorkspace } from "./helpers";

// 定位到文件树里的某个节点行（排除书签/最近打开区块），右键并等菜单出现
async function rightClickTreeNode(page: Page, name: string) {
  // 最近打开/书签条目也在 .sidebar-tree 内，且最近打开用的是 <button class="tree-row-file">，
  // 与树节点同类名。但它们没有 onContextMenu，右键不会弹菜单。
  // 区分：树文件节点在 .tree-children 下，树目录节点在 .tree-node 下；
  //       最近打开/书签在 .recent-section 下。用祖先选择器精确限定到树节点。
  const node = page.locator(
    ".sidebar-tree .tree-node button.tree-row-dir, .sidebar-tree .tree-children button.tree-row-file",
  )
    .filter({ hasText: name })
    .first();
  await node.click({ button: "right" });
  await expect(page.locator(".tree-context-menu")).toBeVisible({ timeout: 5_000 });
}

// 点击右键菜单项（用 exact regex 避免子串误匹配，如"新建文件"vs"新建文件夹"）
async function clickContextItem(page: Page, text: string, exact = false) {
  const pattern = exact ? new RegExp(`^${text}$`) : text;
  const item = page.locator(".tree-context-item").filter({ hasText: pattern });
  await item.click();
}

test.describe("文件树右键菜单", () => {
  test.beforeEach(async ({ page }) => {
    await openMockWorkspace(page);
  });

  test("FC1 目录右键菜单项齐全", async ({ page }) => {
    await rightClickTreeNode(page, "mock-workspace");
    await expect(page.locator(".tree-context-item").filter({ hasText: /^新建文件$/ })).toBeVisible();
    await expect(page.locator(".tree-context-item").filter({ hasText: "新建文件夹" })).toBeVisible();
    await expect(page.locator(".tree-context-item").filter({ hasText: "复制路径" })).toBeVisible();
  });

  test("FC2 新建文件并自动打开", async ({ page }) => {
    await rightClickTreeNode(page, "notes");
    await clickContextItem(page, "新建文件", true);
    await expect(page.locator(".tree-row-new .rename-input")).toBeVisible({ timeout: 5_000 });
    await page.locator(".tree-row-new .rename-input").fill("e2e-new.md");
    await page.keyboard.press("Enter");
    await expect(page.locator(".tree-children .tree-row-file").filter({ hasText: "e2e-new.md" })).toBeVisible({ timeout: 5_000 });
  });

  test("FC3 重命名文件", async ({ page }) => {
    await rightClickTreeNode(page, "todo.md");
    await clickContextItem(page, "重命名");
    await expect(page.locator(".tree-row-rename .rename-input")).toBeVisible({ timeout: 5_000 });
    await page.locator(".tree-row-rename .rename-input").fill("renamed-todo.md");
    await page.keyboard.press("Enter");
    await expect(page.locator(".tree-children .tree-row-file").filter({ hasText: "renamed-todo.md" })).toBeVisible({ timeout: 5_000 });
  });

  test("FC4 加入书签", async ({ page }) => {
    await rightClickTreeNode(page, "intro.md");
    await clickContextItem(page, "加入书签");
    await expect(page.locator(".recent-section").locator("text=书签")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".recent-section").getByText("intro.md", { exact: true })).toBeVisible();
  });

  test("FC5 已书签文件菜单变取消书签", async ({ page }) => {
    await rightClickTreeNode(page, "intro.md");
    await clickContextItem(page, "加入书签");
    await expect(page.locator(".recent-section").getByText("intro.md")).toBeVisible({ timeout: 5_000 });
    // 再次右键树节点（限定 .tree-row-file，避免误点书签条目）
    await rightClickTreeNode(page, "intro.md");
    await expect(page.locator(".tree-context-item").filter({ hasText: "取消书签" })).toBeVisible();
  });

  test("FC6 删除文件确认对话框", async ({ page }) => {
    // 先新建一个待删文件
    await rightClickTreeNode(page, "notes");
    await clickContextItem(page, "新建文件", true);
    await page.locator(".tree-row-new .rename-input").fill("to-delete.md");
    await page.keyboard.press("Enter");
    await expect(page.locator(".tree-children .tree-row-file").filter({ hasText: "to-delete.md" })).toBeVisible({ timeout: 5_000 });

    // 右键删除，点取消（保留）
    let dialogHandled = false;
    page.on("dialog", (d) => {
      dialogHandled = true;
      expect(d.message()).toContain("to-delete.md");
      d.dismiss();
    });
    await rightClickTreeNode(page, "to-delete.md");
    await clickContextItem(page, "删除");
    await page.waitForTimeout(500);
    expect(dialogHandled).toBe(true);
    await expect(page.locator(".tree-children .tree-row-file").filter({ hasText: "to-delete.md" })).toBeVisible();
  });

  test("FC7 .md 文件显示在新窗口打开项", async ({ page }) => {
    await rightClickTreeNode(page, "readme.md");
    await expect(page.locator(".tree-context-item").filter({ hasText: "在新窗口打开" })).toBeVisible();
  });

  test("FC8 复制路径写入剪贴板", async ({ page }, testInfo) => {
    await testInfo.annotations.push({ type: "needs-clipboard", description: "需 clipboard 权限" });
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await rightClickTreeNode(page, "readme.md");
    await clickContextItem(page, "复制路径");
    await page.waitForTimeout(300);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain("readme.md");
  });
});
