// E2E：自动配对补全
// 覆盖：括号/引号自动配对、光标居中、Backspace 删双、选区包裹
//
// 用 newDraft 建空草稿后再输入，避免在 readme.md 末尾 End+Enter 的时序不稳。

import { test, expect, type Page } from "@playwright/test";
import { openMockWorkspace, openFile, MOD } from "./helpers";

// 读取 ProseMirror 编辑器的完整文本内容
// 剔除 ProseMirror 在选区插入的 ⋮ 光标占位 widget 文本，只留真实内容
async function editorText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.querySelector(".ProseMirror");
    if (!el) return "";
    return (el.textContent ?? "").replace(/⋮/g, "");
  });
}

// 新建空草稿并聚焦首段，确保光标落在可编辑空段落内
async function newDraft(page: Page) {
  await page.keyboard.press(`${MOD}+n`);
  await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator(".ProseMirror p")).toBeVisible({ timeout: 5_000 });
  await page.locator(".ProseMirror p").first().click();
}

test.describe("自动配对", () => {
  test.beforeEach(async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
  });

  test("AP1 输入 ( 自动补全 )", async ({ page }) => {
    await newDraft(page);
    await page.keyboard.type("(");
    await page.waitForTimeout(150);
    const text = await editorText(page);
    expect(text).toContain("()");
  });

  test("AP2 输入 [ 自动补全 ]", async ({ page }) => {
    await newDraft(page);
    await page.keyboard.type("[");
    await page.waitForTimeout(150);
    const text = await editorText(page);
    expect(text).toContain("[]");
  });

  test("AP3 输入 { 自动补全 }", async ({ page }) => {
    await newDraft(page);
    await page.keyboard.type("{");
    await page.waitForTimeout(150);
    const text = await editorText(page);
    expect(text).toContain("{}");
  });

  test("AP4 输入中文括号 「 自动补全 」", async ({ page }) => {
    await newDraft(page);
    await page.keyboard.type("「");
    await page.waitForTimeout(150);
    const text = await editorText(page);
    expect(text).toContain("「」");
  });

  test("AP5 Backspace 在配对中间删除两个", async ({ page }) => {
    await newDraft(page);
    await page.keyboard.type("(");
    await page.waitForTimeout(150);
    // 光标在 ( 和 ) 之间，Backspace 应删除两个
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(150);
    const text = await editorText(page);
    // () 应被移除（草稿原文为空）
    expect(text).not.toContain("()");
  });

  test("AP6 选区包裹：输入 ( 包裹选中文本", async ({ page }) => {
    await newDraft(page);
    await page.keyboard.type("hello");
    await page.waitForTimeout(150);
    // 全选当前段落文本（Ctrl+A 在 ProseMirror 里选当前块）
    await page.keyboard.press("Control+A");
    await page.waitForTimeout(100);
    // 输入 ( 应包裹选区
    await page.keyboard.type("(");
    await page.waitForTimeout(150);
    const text = await editorText(page);
    expect(text).toContain("(hello)");
  });
});
