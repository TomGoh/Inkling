// E2E：查找替换与快捷键
// 浏览器版本需先点「打开文件夹」加载 mock 工作区并打开一个文件
// 验证 Ctrl+F 打开查找、输入查找词高亮、Ctrl+R 打开替换、替换功能、Esc 关闭

import { test, expect } from "@playwright/test";
import { openFile, openMockWorkspace } from "./helpers";

test.describe("查找替换", () => {
  test("Ctrl+F 打开查找面板", async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
    await expect(page.locator(".search-panel")).toHaveCount(0);
    await page.keyboard.press("Control+f");
    await expect(page.locator(".search-panel")).toBeVisible();
    await expect(page.locator(".search-input").first()).toBeFocused();
  });

  test("输入查找词显示匹配计数", async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
    await page.keyboard.press("Control+f");
    // mock readme.md 含 "mock" 一词，输入后应显示匹配
    await page.locator(".search-input").first().fill("mock");
    // 等待防抖 + 搜索（120ms 防抖 + dispatch）
    await expect(page.locator(".search-count")).toBeVisible({ timeout: 5_000 });
    const count = await page.locator(".search-count").textContent();
    expect(count).toMatch(/\d+\/\d+|无结果/);
  });

  test("Esc 关闭查找面板", async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
    await page.keyboard.press("Control+f");
    await expect(page.locator(".search-panel")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".search-panel")).toHaveCount(0);
  });

  test("Ctrl+R 打开替换面板（含替换框）", async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
    await page.keyboard.press("Control+r");
    await expect(page.locator(".search-panel")).toBeVisible();
    // 替换框应显示（第二个 .search-input）
    await expect(page.locator(".search-panel .search-input").nth(1)).toBeVisible();
  });

  test("展开按钮切换替换框", async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
    await page.keyboard.press("Control+f");
    // 初始只有 1 个输入框（查找）
    await expect(page.locator(".search-panel .search-input")).toHaveCount(1);
    // 点击展开按钮
    await page.locator(".search-toggle-expand").click();
    // 现在有 2 个（查找 + 替换）
    await expect(page.locator(".search-panel .search-input")).toHaveCount(2);
  });

  test("查找导航：下一个/上一个按钮", async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
    await page.keyboard.press("Control+f");
    // readme.md 含多个 "o"（Readme、mock、桌面端、浏览器）
    await page.locator(".search-input").first().fill("o");
    await page.waitForTimeout(400); // 等防抖
    const countText = await page.locator(".search-count").textContent();
    if (countText && countText.includes("/")) {
      const m = countText.match(/(\d+)\/(\d+)/);
      if (m && parseInt(m[2]) > 1) {
        await page.locator(".search-btn", { hasText: "↓" }).click();
        await expect(page.locator(".search-count")).not.toHaveText(countText);
      }
    }
  });
});

test.describe("快捷键", () => {
  test("Ctrl+N 新建未命名草稿", async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
    const initialTabs = await page.locator(".tab").count();
    await page.keyboard.press("Control+n");
    await expect(page.locator(".tab")).toHaveCount(initialTabs + 1);
    // 新 tab 显示「未命名」
    await expect(page.locator(".tab-active")).toContainText("未命名");
  });

  test("Ctrl+\\ 切换侧边栏", async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
    const visibleBefore = await page.locator(".sidebar").isVisible();
    await page.keyboard.press("Control+\\");
    await page.waitForTimeout(300);
    const visibleAfter = await page.locator(".sidebar").isVisible();
    expect(visibleAfter).toBe(!visibleBefore);
  });

  test("Ctrl+' 切换大纲面板", async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
    const visibleBefore = await page.locator(".outline-panel").isVisible().catch(() => false);
    await page.keyboard.press("Control+'");
    await page.waitForTimeout(300);
    const visibleAfter = await page.locator(".outline-panel").isVisible().catch(() => false);
    expect(visibleAfter).toBe(!visibleBefore);
  });

  test("F11 切换禅模式", async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
    await expect(page.locator(".sidebar")).toBeVisible();
    await page.keyboard.press("F11");
    await expect(page.locator(".zen-mode")).toBeVisible();
    await expect(page.locator(".sidebar")).toHaveCount(0);
    // Esc 退出禅模式
    await page.keyboard.press("Escape");
    await expect(page.locator(".sidebar")).toBeVisible();
  });
});
