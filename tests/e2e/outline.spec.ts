// E2E：大纲面板
// 覆盖：显隐、内容渲染、层级缩进、点击跳转、空状态
//
// 注意：大纲面板默认可见（store/ui.ts 中 outlineVisible 初值为 true），
// 直接断言即可；Ctrl+' 是「切换」而非「打开」，无脑按一次会把面板隐藏导致用例失败。
// 若前置操作可能关闭了面板，用 ensureOutlineVisible 兜底。

import { test, expect, type Page } from "@playwright/test";
import { openMockWorkspace, openFile, MOD } from "./helpers";

async function ensureOutlineVisible(page: Page) {
  const visible = await page.locator(".outline-panel").isVisible().catch(() => false);
  if (!visible) {
    await page.keyboard.press(`${MOD}+'`);
    await expect(page.locator(".outline-panel")).toBeVisible({ timeout: 5_000 });
  }
}

test.describe("大纲面板", () => {
  test.beforeEach(async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
  });

  test("O1 打开文件后大纲显示标题", async ({ page }) => {
    await ensureOutlineVisible(page);
    // readme.md 有 H1 "Readme"
    const items = page.locator(".outline-item");
    expect(await items.count()).toBeGreaterThanOrEqual(1);
    await expect(items.first()).toContainText("Readme");
    await expect(items.first()).toHaveClass(/outline-h1/);
  });

  test("O2 多级标题层级与缩进", async ({ page }) => {
    // outline-demo.md 内含 H1/H2/H3 三级标题，直接打开验证（避免 keyboard 输入
    // "##"/"###" 依赖 Control+End 定位，在列表/代码块等节点内会不稳定）
    await openFile(page, "outline-demo.md");
    await ensureOutlineVisible(page);
    await expect(page.locator(".outline-item.outline-h1")).toHaveCount(1);
    await expect(page.locator(".outline-item.outline-h2")).toHaveCount(1);
    await expect(page.locator(".outline-item.outline-h3")).toHaveCount(1);
    // 缩进：h2 paddingLeft > h1，h3 > h2
    const h1Pad = await page.locator(".outline-item.outline-h1").evaluate((el) => getComputedStyle(el).paddingLeft);
    const h2Pad = await page.locator(".outline-item.outline-h2").evaluate((el) => getComputedStyle(el).paddingLeft);
    const h3Pad = await page.locator(".outline-item.outline-h3").evaluate((el) => getComputedStyle(el).paddingLeft);
    expect(parseFloat(h2Pad)).toBeGreaterThan(parseFloat(h1Pad));
    expect(parseFloat(h3Pad)).toBeGreaterThan(parseFloat(h2Pad));
  });

  test("O3 点击大纲项滚动并高亮", async ({ page }) => {
    // 追加多标题
    await page.locator(".ProseMirror").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("## 第二段");
    await page.keyboard.press("Enter");
    await page.keyboard.type("内容内容内容");
    await page.keyboard.press("Enter");
    await page.keyboard.type("## 第三段");
    await ensureOutlineVisible(page);
    const scrollTopBefore = await page.locator(".editor-scroll").evaluate((el) => el.scrollTop);
    // 点击最后一个大纲项
    const lastItem = page.locator(".outline-item").last();
    await lastItem.click();
    // 等待 280ms 滚动动画
    await page.waitForTimeout(400);
    const scrollTopAfter = await page.locator(".editor-scroll").evaluate((el) => el.scrollTop);
    // 滚动位置应有变化（或已到底）
    expect(scrollTopAfter).not.toBe(scrollTopBefore);
  });

  test("O4 单标题文件大纲只有一项", async ({ page }) => {
    await openFile(page, "intro.md");
    await ensureOutlineVisible(page);
    await expect(page.locator(".outline-item")).toHaveCount(1);
  });

  test("O5 空草稿显示空状态", async ({ page }) => {
    // 新建草稿（Ctrl+N）
    await page.keyboard.press(`${MOD}+n`);
    await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 5_000 });
    await ensureOutlineVisible(page);
    await expect(page.locator(".outline-empty")).toBeVisible();
    await expect(page.locator(".outline-empty")).toContainText("文档暂无标题");
  });
});
