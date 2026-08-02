// E2E：斜杠菜单（Slash Menu）
// 覆盖：触发、过滤、键盘导航、各插入项产物

import { test, expect, type Page } from "@playwright/test";
import { openMockWorkspace, openFile, MOD } from "./helpers";

// 在编辑器空段落行首输入 /，等浮层出现。
// 新建空草稿后直接输入，避免 Control+End 在列表/代码块等节点内定位不稳导致 / 被吞掉。
async function triggerSlash(page: Page) {
  // 新建未命名草稿：空文档仅含一个空段落，/ 必然落在 paragraph 内触发插件
  await page.keyboard.press(`${MOD}+n`);
  await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator(".ProseMirror p")).toBeVisible({ timeout: 5_000 });
  await page.locator(".ProseMirror p").first().click();
  await page.keyboard.type("/");
  await expect(page.locator(".slash-popup")).toBeVisible({ timeout: 5_000 });
}

test.describe("斜杠菜单", () => {
  test.beforeEach(async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
  });

  test("S1 输入 / 弹出菜单且项数齐全", async ({ page }) => {
    await triggerSlash(page);
    const items = page.locator(".slash-list .slash-item");
    // 至少 13 项（标题1-3、列表、引用、代码、分割线、表格、公式、Mermaid、提示框、目录、frontmatter）
    expect(await items.count()).toBeGreaterThanOrEqual(13);
  });

  test("S2 输入 /h2 过滤到标题 2 并插入", async ({ page }) => {
    await triggerSlash(page);
    await page.keyboard.type("h2");
    // 过滤后应剩"标题 2"（label 含"标题 2"或 keywords 含 h2）
    const visibleItems = page.locator(".slash-list .slash-item");
    expect(await visibleItems.count()).toBeGreaterThanOrEqual(1);
    await expect(page.locator(".slash-label", { hasText: "标题 2" })).toBeVisible();
    await page.keyboard.press("Enter");
    // 编辑器出现 h2
    await expect(page.locator(".ProseMirror h2").last()).toBeVisible({ timeout: 5_000 });
  });

  test("S3 /mermaid 插入 mermaid 代码块", async ({ page }) => {
    await triggerSlash(page);
    await page.keyboard.type("mermaid");
    await page.keyboard.press("Enter");
    // 出现 mermaid-block（空图可能渲染错误，但容器应在）
    await expect(page.locator(".mermaid-block").first()).toBeVisible({ timeout: 10_000 });
  });

  test("S4 上下键导航改变选中项", async ({ page }) => {
    await triggerSlash(page);
    const firstActive = page.locator(".slash-item-active");
    await expect(firstActive).toBeVisible();
    await page.keyboard.press("ArrowDown");
    // 仍有选中项（索引变化）
    await expect(page.locator(".slash-item-active")).toBeVisible();
  });

  test("S5 Esc 关闭菜单", async ({ page }) => {
    await triggerSlash(page);
    await page.keyboard.press("Escape");
    await expect(page.locator(".slash-popup")).toBeHidden();
  });

  test("S6 /table 插入表格", async ({ page }) => {
    await triggerSlash(page);
    await page.keyboard.type("table");
    await page.keyboard.press("Enter");
    // 编辑器出现 table（2 列 × 2 行：1 表头 + 1 正文）
    await expect(page.locator(".ProseMirror table").last()).toBeVisible({ timeout: 5_000 });
  });

  test("S7 /代码 插入代码块", async ({ page }) => {
    await triggerSlash(page);
    await page.keyboard.type("代码");
    await page.keyboard.press("Enter");
    // 出现 CodeMirror 编辑器容器
    await expect(page.locator(".cm-editor").first()).toBeVisible({ timeout: 5_000 });
  });
});
