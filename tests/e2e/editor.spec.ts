// E2E：编辑器核心流程
// 浏览器版本（isTauri() === false）需先点击「打开文件夹」按钮加载 mock 工作区
// 覆盖：应用启动、打开 mock 文件、编辑器渲染、输入内容、状态栏统计

import { test, expect } from "@playwright/test";
import { expandMockNotes, openFile, openMockWorkspace } from "./helpers";

test.describe("编辑器核心流程", () => {
  test("应用启动后显示侧边栏与打开按钮", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".sidebar")).toBeVisible();
    // 空状态提示
    await expect(page.getByText(/打开文件夹/)).toBeVisible();
    // 打开文件夹按钮存在
    await expect(page.getByRole("button", { name: "打开文件夹" })).toBeVisible();
  });

  test("点击「打开文件夹」加载 mock 工作区", async ({ page }) => {
    await openMockWorkspace(page);
    // 子目录默认折叠，展开后才加载其中的文件
    await expect(page.locator(".sidebar-tree").getByText("intro.md")).toBeVisible();
    await expect(page.locator(".sidebar-tree").getByText("readme.md")).toHaveCount(0);
    await expandMockNotes(page);
    await expect(page.locator(".sidebar-tree").getByText("readme.md")).toBeVisible();
    await expect(page.locator(".sidebar-tree").getByText("todo.md")).toBeVisible();
  });

  test("点击 mock 文件打开编辑器", async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
    // 标签页显示文件名
    await expect(page.locator(".tab-active")).toContainText("readme.md");
  });

  test("编辑器渲染 mock 文件内容", async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
    // mock readme.md 内容含 "Readme" 标题
    await expect(page.locator(".ProseMirror h1")).toContainText("Readme");
  });

  test("输入内容后状态栏字数更新", async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
    const initial = await page.locator(".status-bar").textContent();
    // 在编辑器末尾输入
    await page.locator(".ProseMirror").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("测试输入新内容");
    await expect(page.locator(".status-bar")).not.toHaveText(initial ?? "", { timeout: 5_000 });
  });

  test("状态栏显示字数/字符/行数", async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
    const text = (await page.locator(".status-bar").textContent()) ?? "";
    expect(text).toContain("字数");
    expect(text).toContain("字符");
    expect(text).toContain("行");
    expect(text).toContain("阅读");
  });
});

test.describe("多标签页", () => {
  test("打开多个文件显示多个 tab", async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
    await openFile(page, "todo.md");
    await openFile(page, "intro.md");
    await expect(page.locator(".tab")).toHaveCount(3);
  });

  test("点击 tab 切换文件", async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
    await openFile(page, "todo.md");
    await expect(page.locator(".tab-active")).toContainText("todo.md");
    // 点击 readme.md tab 切换回去
    await page.locator(".tab", { hasText: "readme.md" }).click();
    await expect(page.locator(".tab-active")).toContainText("readme.md");
  });

  test("关闭 tab", async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
    await openFile(page, "todo.md");
    await expect(page.locator(".tab")).toHaveCount(2);
    await page.locator(".tab-active .tab-close").click();
    await expect(page.locator(".tab")).toHaveCount(1);
  });
});
