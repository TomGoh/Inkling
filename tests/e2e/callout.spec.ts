// E2E：Callout 提示框渲染
// 覆盖：NOTE/WARNING/TIP 类型、图标、标题、内容、data-callout-type

import { test, expect } from "@playwright/test";
import { openMockWorkspace, openFile } from "./helpers";

test.describe("Callout 提示框", () => {
  test.beforeEach(async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "callout-demo.md");
  });

  test("C1 NOTE 类型渲染", async ({ page }) => {
    const note = page.locator(".callout-block.callout-note");
    await expect(note).toBeVisible({ timeout: 10_000 });
    await expect(note).toHaveAttribute("data-callout-type", "note");
    await expect(note.locator(".callout-title")).toContainText("注意");
    await expect(note.locator(".callout-content")).toContainText("这是一个提示框");
  });

  test("C2 WARNING 类型渲染", async ({ page }) => {
    const warn = page.locator(".callout-block.callout-warning");
    await expect(warn).toBeVisible({ timeout: 10_000 });
    await expect(warn).toHaveAttribute("data-callout-type", "warning");
    await expect(warn.locator(".callout-title")).toContainText("警告");
  });

  test("C3 TIP 类型渲染", async ({ page }) => {
    const tip = page.locator(".callout-block.callout-tip");
    await expect(tip).toBeVisible({ timeout: 10_000 });
    await expect(tip).toHaveAttribute("data-callout-type", "tip");
    await expect(tip.locator(".callout-title")).toContainText("技巧");
  });

  test("C4 头部图标存在", async ({ page }) => {
    const note = page.locator(".callout-block.callout-note");
    await expect(note).toBeVisible({ timeout: 10_000 });
    await expect(note.locator(".callout-icon")).toBeVisible();
  });

  test("C5 头部不可编辑", async ({ page }) => {
    const note = page.locator(".callout-block.callout-note");
    await expect(note).toBeVisible({ timeout: 10_000 });
    const header = note.locator(".callout-header");
    await expect(header).toHaveAttribute("contenteditable", "false");
  });
});
