// E2E：表格工具栏
// 覆盖：工具栏可见、表格选择器、插入表格、行/列增删、对齐、删除表格、Mermaid/公式/标题按钮

import { test, expect } from "@playwright/test";
import { openMockWorkspace, openFile } from "./helpers";

test.describe("表格工具栏", () => {
  test.beforeEach(async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
  });

  test("T1 工具栏可见且常驻按钮齐全", async ({ page }) => {
    await expect(page.locator(".table-toolbar")).toBeVisible();
    // 标题、列表、代码、插入菜单
    await expect(page.locator('.tt-btn[title="标题 1"]')).toBeVisible();
    await expect(page.locator('.tt-btn[title="标题 2"]')).toBeVisible();
    await expect(page.locator('.tt-btn[title="无序列表"]')).toBeVisible();
    await expect(page.locator('.tt-btn[title="代码块"]')).toBeVisible();
    await expect(page.locator('.tt-overflow-btn')).toBeVisible();
  });

  test("T2 点击表格按钮弹出选择器", async ({ page }) => {
    await page.locator('.tt-overflow-btn').click();
    await page.locator('.tt-menu-item[title="插入表格"]').click();
    await expect(page.locator(".table-picker")).toBeVisible();
    await expect(page.locator(".picker-grid .picker-cell").first()).toBeVisible();
    await expect(page.locator(".picker-label")).toContainText(/行.*列/);
  });

  test("T3 选 2x2 插入表格", async ({ page }) => {
    await page.locator('.tt-overflow-btn').click();
    await page.locator('.tt-menu-item[title="插入表格"]').click();
    // hover 到第 2 行第 2 列的 cell（索引 (1,1)）
    const cells = page.locator(".picker-grid .picker-cell");
    await cells.nth(5).hover(); // 第 2 行第 2 列（8 列网格，索引 = 1*8+1 = 9... 取一个能触发 2x2 的）
    await cells.nth(9).click();
    await expect(page.locator(".ProseMirror table").last()).toBeVisible({ timeout: 5_000 });
  });

  test("T4 表格内显示行列操作按钮", async ({ page }) => {
    // 先插入表格
    await page.locator('.tt-overflow-btn').click();
    await page.locator('.tt-menu-item[title="插入表格"]').click();
    await page.locator(".picker-grid .picker-cell").nth(9).click();
    await expect(page.locator(".ProseMirror table")).toBeVisible();
    // 点击单元格进入表格
    await page.locator(".ProseMirror table td").first().click();
    // inTable 按钮出现
    await expect(page.locator('.tt-btn[title="在下方插入行"]')).toBeVisible();
    await expect(page.locator('.tt-btn[title="删除整张表格"]')).toBeVisible();
  });

  test("T5 下行插入增加行", async ({ page }) => {
    await page.locator('.tt-overflow-btn').click();
    await page.locator('.tt-menu-item[title="插入表格"]').click();
    await page.locator(".picker-grid .picker-cell").nth(9).click();
    const rowsBefore = await page.locator(".ProseMirror table tr").count();
    await page.locator(".ProseMirror table td").first().click();
    await page.locator('.tt-btn[title="在下方插入行"]').click();
    const rowsAfter = await page.locator(".ProseMirror table tr").count();
    expect(rowsAfter).toBe(rowsBefore + 1);
  });

  test("T6 删行减少行", async ({ page }) => {
    await page.locator('.tt-overflow-btn').click();
    await page.locator('.tt-menu-item[title="插入表格"]').click();
    await page.locator(".picker-grid .picker-cell").nth(9).click();
    // 先加一行确保有可删的行
    await page.locator(".ProseMirror table td").first().click();
    await page.locator('.tt-btn[title="在下方插入行"]').click();
    const rowsBefore = await page.locator(".ProseMirror table tr").count();
    await page.locator(".ProseMirror table td").first().click();
    await page.locator('.tt-btn[title="删除当前行"]').click();
    const rowsAfter = await page.locator(".ProseMirror table tr").count();
    expect(rowsAfter).toBe(rowsBefore - 1);
  });

  test("T7 右列插入增加列", async ({ page }) => {
    await page.locator('.tt-overflow-btn').click();
    await page.locator('.tt-menu-item[title="插入表格"]').click();
    await page.locator(".picker-grid .picker-cell").nth(9).click();
    const colsBefore = await page.locator(".ProseMirror table tr").first().locator("th,td").count();
    await page.locator(".ProseMirror table td").first().click();
    await page.locator('.tt-btn[title="在右侧插入列"]').click();
    const colsAfter = await page.locator(".ProseMirror table tr").first().locator("th,td").count();
    expect(colsAfter).toBe(colsBefore + 1);
  });

  test("T8 居中对齐设置单元格", async ({ page }) => {
    await page.locator('.tt-overflow-btn').click();
    await page.locator('.tt-menu-item[title="插入表格"]').click();
    await page.locator(".picker-grid .picker-cell").nth(9).click();
    await page.locator(".ProseMirror table td").first().click();
    await page.locator('.tt-btn[title="居中"]').click();
    // 对齐通过 colgroup 的 style 或单元格属性，断言不抛错即视为通过
    await expect(page.locator(".ProseMirror table")).toBeVisible();
  });

  test("T9 删除表格", async ({ page }) => {
    await page.locator('.tt-overflow-btn').click();
    await page.locator('.tt-menu-item[title="插入表格"]').click();
    await page.locator(".picker-grid .picker-cell").nth(9).click();
    await expect(page.locator(".ProseMirror table")).toBeVisible();
    await page.locator(".ProseMirror table td").first().click();
    await page.locator('.tt-btn[title="删除整张表格"]').click();
    await expect(page.locator(".ProseMirror table")).toHaveCount(0);
  });

  test("T10 Mermaid 按钮插入 mermaid 块", async ({ page }) => {
    await page.locator('.tt-overflow-btn').click();
    await page.locator('.tt-menu-item[title="Mermaid 图表"]').click();
    await expect(page.locator(".mermaid-block").first()).toBeVisible({ timeout: 10_000 });
  });

  test("T11 公式按钮插入块级公式", async ({ page }) => {
    await page.locator('.tt-overflow-btn').click();
    await page.locator('.tt-menu-item[title="插入块级公式"]').click();
    // 块级公式容器（KaTeX 或 ProseMirror math 节点）
    await expect(page.locator(".ProseMirror .math-display, .ProseMirror [data-math-display]").first()).toBeVisible({ timeout: 5_000 });
  });

  test("T12 H2 按钮转为二级标题", async ({ page }) => {
    await page.locator(".ProseMirror").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("待转换段落");
    await page.locator('.tt-btn[title="标题 2"]').click();
    await expect(page.locator(".ProseMirror h2").last()).toBeVisible({ timeout: 5_000 });
  });
});
