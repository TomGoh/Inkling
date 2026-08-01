// E2E：编辑器核心流程
// 浏览器版本（isTauri() === false）走 mock 文件树
// 覆盖：应用启动、打开 mock 文件、编辑器渲染、输入内容、状态栏统计

import { test, expect } from "@playwright/test";

test.describe("编辑器核心流程", () => {
  test("应用启动后显示侧边栏和 mock 工作区", async ({ page }) => {
    await page.goto("/");
    // 侧边栏可见
    await expect(page.locator(".sidebar")).toBeVisible();
    // mock 工作区
    await expect(page.getByText("mock-workspace")).toBeVisible();
  });

  test("点击 mock 文件打开编辑器", async ({ page }) => {
    await page.goto("/");
    // 点击 readme.md
    await page.getByText("readme.md").click();
    // 编辑器出现
    await expect(page.locator(".ProseMirror")).toBeVisible();
    // 标签页显示文件名
    await expect(page.locator(".tab-active")).toContainText("readme.md");
  });

  test("编辑器渲染 mock 文件内容", async ({ page }) => {
    await page.goto("/");
    await page.getByText("readme.md").click();
    // mock readme.md 内容含 "Readme" 标题
    await expect(page.locator(".ProseMirror h1")).toContainText("Readme");
  });

  test("输入内容后状态栏字数更新", async ({ page }) => {
    await page.goto("/");
    await page.getByText("readme.md").click();
    // 记录初始字数
    const initial = await page.locator(".status-bar").textContent();
    // 在编辑器末尾输入
    await page.locator(".ProseMirror").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("测试输入新内容");
    // 状态栏字数应变化
    await expect(page.locator(".status-bar")).not.toHaveText(initial ?? "");
  });

  test("状态栏显示字数/字符/行数", async ({ page }) => {
    await page.goto("/");
    await page.getByText("readme.md").click();
    const text = (await page.locator(".status-bar").textContent()) ?? "";
    expect(text).toContain("字数");
    expect(text).toContain("字符");
    expect(text).toContain("行");
    expect(text).toContain("阅读");
  });
});

test.describe("多标签页", () => {
  test("打开多个文件显示多个 tab", async ({ page }) => {
    await page.goto("/");
    await page.getByText("readme.md").click();
    await page.getByText("todo.md").click();
    await page.getByText("intro.md").click();
    // 应有 3 个 tab
    await expect(page.locator(".tab")).toHaveCount(3);
  });

  test("点击 tab 切换文件", async ({ page }) => {
    await page.goto("/");
    await page.getByText("readme.md").click();
    await page.getByText("todo.md").click();
    // 当前激活 todo.md
    await expect(page.locator(".tab-active")).toContainText("todo.md");
    // 点击 readme.md tab 切换回去
    await page.locator(".tab", { hasText: "readme.md" }).click();
    await expect(page.locator(".tab-active")).toContainText("readme.md");
  });

  test("关闭 tab", async ({ page }) => {
    await page.goto("/");
    await page.getByText("readme.md").click();
    await page.getByText("todo.md").click();
    await expect(page.locator(".tab")).toHaveCount(2);
    // 关闭当前 tab
    await page.locator(".tab-active .tab-close").click();
    await expect(page.locator(".tab")).toHaveCount(1);
  });
});
