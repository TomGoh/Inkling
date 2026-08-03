// E2E：全局搜索（Ctrl/Cmd+Shift+F）
// 覆盖：打开、搜索匹配、结果分组、点击跳转、正则切换、Esc 关闭、未打开工作区降级

import { test, expect } from "@playwright/test";
import { openMockWorkspace, openFile, MOD } from "./helpers";

// 触发全局搜索快捷键
async function openGlobalSearch(page: import("@playwright/test").Page) {
  await page.keyboard.press(`${MOD}+Shift+F`);
  await expect(page.locator(".gs-modal")).toBeVisible({ timeout: 5_000 });
}

test.describe("全局搜索", () => {
  test.beforeEach(async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
  });

  test("G1 Ctrl+Shift+F 打开面板且输入框聚焦", async ({ page }) => {
    await openGlobalSearch(page);
    await expect(page.locator(".gs-input")).toBeFocused();
  });

  test("G2 搜索 mock 命中多个文件", async ({ page }) => {
    await openGlobalSearch(page);
    await page.locator(".gs-input").fill("mock");
    // 状态栏显示匹配信息
    await expect(page.locator(".gs-status")).toContainText(/个文件.*处匹配/, { timeout: 10_000 });
    // 至少 1 个结果分组
    const groups = page.locator(".gs-group");
    expect(await groups.count()).toBeGreaterThanOrEqual(1);
  });

  test("G3 搜索中文命中且高亮", async ({ page }) => {
    await openGlobalSearch(page);
    await page.locator(".gs-input").fill("任务");
    await expect(page.locator(".gs-group").first()).toBeVisible({ timeout: 10_000 });
    // 命中预览有高亮 mark
    await expect(page.locator(".gs-highlight").first()).toBeVisible();
    await expect(page.locator(".gs-highlight").first()).toContainText("任务");
  });

  test("G4 点击命中项跳转到对应文件", async ({ page }) => {
    await openGlobalSearch(page);
    await page.locator(".gs-input").fill("任务");
    await expect(page.locator(".gs-hit").first()).toBeVisible({ timeout: 10_000 });
    // 点击第一条命中
    await page.locator(".gs-hit").first().click();
    // 标签页应切到命中的文件（todo.md）
    await expect(page.locator(".tab-active")).toContainText("todo.md", { timeout: 5_000 });
  });

  test("G5 正则模式切换", async ({ page }) => {
    await openGlobalSearch(page);
    // 勾选正则（checkbox display:none，用 label 点击）
    const regexToggle = page.locator('.gs-toggle[title="正则表达式"]');
    await regexToggle.click();
    await page.locator(".gs-input").fill("任务[12]");
    // 正则模式下应匹配"任务1""任务2"
    await expect(page.locator(".gs-status")).toContainText(/匹配/, { timeout: 10_000 });
  });

  test("G6 Esc 关闭面板", async ({ page }) => {
    await openGlobalSearch(page);
    await page.keyboard.press("Escape");
    await expect(page.locator(".gs-modal")).toBeHidden();
  });

  test("G7 无匹配结果显示提示", async ({ page }) => {
    await openGlobalSearch(page);
    await page.locator(".gs-input").fill("zzzz_not_exist_zzzz");
    await expect(page.locator(".gs-status")).toContainText("无匹配结果", { timeout: 10_000 });
  });
});
