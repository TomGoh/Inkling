// E2E：杂项（标签页右键菜单、快捷键帮助、任务列表、HTML 嵌入、脚注渲染）
// 覆盖：标签右键关闭/关闭其他、快捷键帮助面板、任务列表 data-checked、
//       HTML 嵌入 kbd/mark/details、脚注引用与定义

import { test, expect } from "@playwright/test";
import { openMockWorkspace, openFile, MOD } from "./helpers";

test.describe("标签页右键菜单", () => {
  test.beforeEach(async ({ page }) => {
    await openMockWorkspace(page);
    // 打开 3 个文件
    await openFile(page, "readme.md");
    await openFile(page, "todo.md");
    await openFile(page, "intro.md");
  });

  test("TC1 右键标签弹出菜单", async ({ page }) => {
    await page.locator(".tab-active").click({ button: "right" });
    await expect(page.locator(".tab-context-menu")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".tab-context-item").filter({ hasText: /^关闭$/ })).toBeVisible();
    await expect(page.locator(".tab-context-item").filter({ hasText: "关闭其他" })).toBeVisible();
    await expect(page.locator(".tab-context-item").filter({ hasText: "全部关闭" })).toBeVisible();
  });

  test("TC2 关闭其他只保留当前", async ({ page }) => {
    // beforeEach 已打开多个文件；确保至少 2 个 tab
    await expect(page.locator(".tabs-bar .tab").first()).toBeVisible();
    const tabsBefore = await page.locator(".tabs-bar .tab").count();
    expect(tabsBefore).toBeGreaterThanOrEqual(2);
    await page.locator(".tab-active").click({ button: "right" });
    await page.locator(".tab-context-item").filter({ hasText: "关闭其他" }).click();
    await page.waitForTimeout(500);
    const tabsAfter = await page.locator(".tabs-bar .tab").count();
    expect(tabsAfter).toBe(1);
  });

  test("TC3 关闭右侧", async ({ page }) => {
    // 切到第一个 tab（readme）后右键
    await page.locator(".tabs-bar .tab").first().click();
    const tabsBefore = await page.locator(".tabs-bar .tab").count();
    await page.locator(".tabs-bar .tab").first().click({ button: "right" });
    await page.locator(".tab-context-item", { hasText: "关闭右侧" }).click();
    await page.waitForTimeout(500);
    const tabsAfter = await page.locator(".tabs-bar .tab").count();
    expect(tabsAfter).toBeLessThan(tabsBefore);
  });

  test("TC4 全部关闭回到空状态", async ({ page }) => {
    await page.locator(".tab-active").click({ button: "right" });
    await page.locator(".tab-context-item", { hasText: "全部关闭" }).click();
    await page.waitForTimeout(500);
    await expect(page.locator(".tabs-bar .tab")).toHaveCount(0);
  });
});

test.describe("快捷键帮助面板", () => {
  test.beforeEach(async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
  });

  test("SH1 Ctrl+/ 打开快捷键帮助", async ({ page }) => {
    await page.keyboard.press(`${MOD}+/`);
    await expect(page.locator(".shortcuts-modal")).toBeVisible({ timeout: 5_000 });
    // 至少 5 个分组
    const sections = page.locator(".shortcuts-section");
    expect(await sections.count()).toBeGreaterThanOrEqual(5);
  });

  test("SH2 帮助内含关键描述", async ({ page }) => {
    await page.keyboard.press(`${MOD}+/`);
    await expect(page.locator(".shortcuts-modal")).toBeVisible();
    // 查找替换、侧边栏等关键描述
    const body = await page.locator(".shortcuts-body").textContent();
    expect(body).toMatch(/查找|侧边栏|禅模式|设置/);
  });

  test("SH3 Esc 关闭帮助", async ({ page }) => {
    await page.keyboard.press(`${MOD}+/`);
    await expect(page.locator(".shortcuts-modal")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".shortcuts-modal")).toBeHidden();
  });
});

test.describe("渲染元素回归", () => {
  test("R1 任务列表渲染 data-checked 属性", async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "todo.md");
    // todo.md 含 - [x] 任务1 / - [ ] 任务2
    const taskItems = page.locator('.ProseMirror li[data-item-type="task"]');
    await expect(taskItems.first()).toBeVisible({ timeout: 5_000 });
    expect(await taskItems.count()).toBe(3);
    // 第一个 checked
    await expect(taskItems.first()).toHaveAttribute("data-checked", "true");
    // 后两个未 checked
    await expect(taskItems.nth(1)).toHaveAttribute("data-checked", "false");
  });

  test("R2 HTML 嵌入渲染 kbd/mark/details", async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "html-demo.md");
    // html-inline 容器
    await expect(page.locator(".ProseMirror .html-inline").first()).toBeVisible({ timeout: 5_000 });
    // 内层 kbd、mark、details
    await expect(page.locator(".ProseMirror .html-inline kbd").first()).toBeVisible();
    await expect(page.locator(".ProseMirror .html-inline mark").first()).toBeVisible();
    await expect(page.locator(".ProseMirror .html-inline details").first()).toBeVisible();
  });

  test("R3 脚注引用与定义渲染", async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "footnote-demo.md");
    // 引用 sup.footnote-ref
    const refs = page.locator(".ProseMirror sup.footnote-ref");
    await expect(refs.first()).toBeVisible({ timeout: 5_000 });
    expect(await refs.count()).toBe(3);
    // 定义 .footnote-definition
    const defs = page.locator(".ProseMirror .footnote-definition");
    await expect(defs.first()).toBeVisible();
    expect(await defs.count()).toBe(3);
  });
});
