// E2E：Quick Open（Ctrl/Cmd+P，#228）
//
// 覆盖：打开并聚焦、实时过滤、键盘选中后打开、Esc 关闭、空态、双向模态互斥。
//
// 说明：「单文件模式（未打开工作区）」在本 E2E 装配下无法进入——helpers 的 openFile
// 依赖已打开工作区的文件树。该场景由单测覆盖（quick-open-panel.test.tsx 的
// 「单文件模式：候选来自已打开标签页 + 最近文件，且不调用索引命令」）。

import { test, expect } from "@playwright/test";
import { openMockWorkspace, openFile, MOD } from "./helpers";

async function openQuickOpen(page: import("@playwright/test").Page) {
  await page.keyboard.press(`${MOD}+P`);
  await expect(page.locator(".qo-modal")).toBeVisible({ timeout: 5_000 });
}

test.describe("Quick Open", () => {
  test.beforeEach(async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
  });

  test("Q1 Ctrl+P 打开并聚焦输入框", async ({ page }) => {
    await openQuickOpen(page);
    await expect(page.locator(".qo-input")).toBeFocused();
  });

  test("Q2 输入实时过滤，高亮项可由键盘确认并打开对应文件", async ({ page }) => {
    await openQuickOpen(page);
    await page.locator(".qo-input").fill("todo");

    const items = page.locator(".qo-item");
    await expect(items.first()).toContainText("todo.md");
    // 首项即为高亮项（aria-activedescendant 指向它）
    await expect(items.first()).toHaveClass(/qo-item-active/);

    await page.keyboard.press("Enter");

    await expect(page.locator(".qo-modal")).toBeHidden();
    await expect(page.locator(".tabs-bar")).toContainText("todo.md");
    await expect(page.locator(".ProseMirror")).toBeVisible();
  });

  test("Q3 空查询展示候选；无匹配时展示空态", async ({ page }) => {
    await openQuickOpen(page);

    // 空查询：直接列出候选（含 mock 工作区里的文件）
    await expect(page.locator(".qo-item").first()).toBeVisible({ timeout: 5_000 });
    expect(await page.locator(".qo-item").count()).toBeGreaterThanOrEqual(1);

    await page.locator(".qo-input").fill("zzzz_not_exist_zzzz");
    await expect(page.locator(".qo-empty")).toContainText("无匹配结果", { timeout: 5_000 });
    await expect(page.locator(".qo-item")).toHaveCount(0);
  });

  test("Q4 Esc 关闭面板", async ({ page }) => {
    await openQuickOpen(page);
    await page.keyboard.press("Escape");
    await expect(page.locator(".qo-modal")).toBeHidden();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("Q5 模态互斥：全局搜索打开时按 Ctrl+P 不叠加", async ({ page }) => {
    await page.keyboard.press(`${MOD}+Shift+F`);
    await expect(page.locator(".gs-modal")).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press(`${MOD}+P`);

    await expect(page.locator(".qo-modal")).toHaveCount(0);
    await expect(page.locator(".gs-modal")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
  });

  test("Q6 模态互斥：Quick Open 打开时按 Ctrl+Shift+F 不叠加", async ({ page }) => {
    await openQuickOpen(page);

    await page.keyboard.press(`${MOD}+Shift+F`);

    await expect(page.locator(".gs-modal")).toHaveCount(0);
    await expect(page.locator(".qo-modal")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
  });
});
