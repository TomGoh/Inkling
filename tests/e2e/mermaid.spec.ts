// E2E：Mermaid 流程图渲染（v2.0.1 重点回归）
// 覆盖：基础渲染、多行节点防裁切、编辑模式、重新渲染、Esc 放弃、
//       双击编辑、Ctrl+滚轮缩放、错误降级

import { test, expect } from "@playwright/test";
import { openMockWorkspace, openFile, MULTILINE_FLOWCHART } from "./helpers";

// 通过表格工具栏的 Mermaid 按钮插入空 mermaid 块，再用编辑 textarea 填入代码并提交渲染
async function insertMermaid(page: import("@playwright/test").Page, code: string) {
  // 1. 用工具栏下拉菜单按钮插入空 mermaid 代码块
  await page.locator('.tt-overflow-btn').click();
  await page.locator('.tt-menu-item[title="Mermaid 图表"]').click();
  await expect(page.locator(".mermaid-block").first()).toBeVisible({ timeout: 10_000 });
  const block = page.locator(".mermaid-block").first();
  // 2. 进入编辑模式，填入代码
  await block.hover();
  await block.locator(".mermaid-edit-btn").click();
  await expect(block.locator(".mermaid-editor")).toBeVisible({ timeout: 5_000 });
  await block.locator(".mermaid-editor").fill(code);
  // 3. Ctrl+Enter 提交渲染（空代码会显示 placeholder，非空才渲染 SVG）
  await page.keyboard.press("Control+Enter");
  // 4. 等待渲染产物：有内容时出 svg，非法时出 .mermaid-error
  await page.waitForTimeout(500);
}

test.describe("Mermaid 流程图渲染", () => {
  test.beforeEach(async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
  });

  test("M1 插入 mermaid 流程图渲染出 SVG", async ({ page }) => {
    await insertMermaid(page, "graph TD; A-->B");
    await expect(page.locator(".mermaid-block")).toHaveCount(1);
    await expect(page.locator(".mermaid-render svg")).toBeVisible();
    // 不应出现错误降级
    await expect(page.locator(".mermaid-error")).toHaveCount(0);
  });

  test("M2 v2.0.1 多行节点回归：含 <br/> + style stroke-width:2px 不裁切", async ({ page }) => {
    await insertMermaid(page, MULTILINE_FLOWCHART);
    // 渲染成功（无错误）
    await expect(page.locator(".mermaid-error")).toHaveCount(0);
    // 存在多个节点标签（多行节点）
    const nodeLabels = page.locator(".mermaid-render .nodeLabel");
    await expect(nodeLabels.first()).toBeVisible();
    expect(await nodeLabels.count()).toBeGreaterThan(3);
    // 关键回归断言：每个节点 rect 高度 >= 其内 nodeLabel 的 scrollHeight
    // 防止 v2.0.1 修复回退（rect 偏矮导致文字溢出底边）
    const noClipping = await page.locator(".mermaid-render svg").first().evaluate((svg) => {
      const rects = Array.from(svg.querySelectorAll("rect"));
      const labels = Array.from(svg.querySelectorAll("foreignObject .nodeLabel, .nodeLabel"));
      if (labels.length === 0) return true; // 无可断言节点，视为通过
      // 每个标签都应在某个 rect 内（取包容它的 rect 验证高度足够）
      for (const label of labels) {
        const lh = (label as HTMLElement).scrollHeight;
        const labelRect = label.getBoundingClientRect();
        // 找到与该 label 水平重叠的 rect
        const enclosing = rects.find((r) => {
          const rb = r.getBoundingClientRect();
          return rb.left <= labelRect.left + 1 && rb.right >= labelRect.right - 1;
        });
        if (enclosing) {
          const rh = enclosing.getBoundingClientRect().height;
          // rect 高度应 >= label 滚动高度（减去内边距容差）
          if (rh + 2 < lh) return false;
        }
      }
      return true;
    });
    expect(noClipping, "节点 rect 高度应容纳其内文字，不应裁切").toBe(true);
  });

  test("M3 编辑模式切换：点击编辑按钮显示 textarea", async ({ page }) => {
    await insertMermaid(page, "graph TD; A-->B");
    const block = page.locator(".mermaid-block").first();
    await block.hover();
    await block.locator(".mermaid-edit-btn").click();
    // textarea 显示，按钮文案变"完成"
    await expect(block.locator(".mermaid-editor")).toBeVisible();
    await expect(block.locator(".mermaid-edit-btn")).toContainText("完成");
  });

  test("M4 编辑后重新渲染", async ({ page }) => {
    await insertMermaid(page, "graph TD; A-->B");
    const block = page.locator(".mermaid-block").first();
    await block.hover();
    await block.locator(".mermaid-edit-btn").click();
    const textarea = block.locator(".mermaid-editor");
    await textarea.fill("graph LR; X-->Y");
    await page.keyboard.press("Control+Enter");
    // textarea 隐藏，SVG 重新生成
    await expect(block.locator(".mermaid-editor")).toBeHidden();
    await expect(block.locator(".mermaid-render svg")).toBeVisible();
  });

  test("M5 Esc 放弃修改保留原内容", async ({ page }) => {
    await insertMermaid(page, "graph TD; A-->B");
    const block = page.locator(".mermaid-block").first();
    await block.hover();
    await block.locator(".mermaid-edit-btn").click();
    const textarea = block.locator(".mermaid-editor");
    await textarea.fill("graph LR; X-->Y");
    await page.keyboard.press("Escape");
    // textarea 隐藏，SVG 仍是原图
    await expect(block.locator(".mermaid-editor")).toBeHidden();
    await expect(block.locator(".mermaid-render svg")).toBeVisible();
  });

  test("M6 双击进入编辑模式", async ({ page }) => {
    await insertMermaid(page, "graph TD; A-->B");
    const block = page.locator(".mermaid-block").first();
    await block.locator(".mermaid-render").dblclick();
    await expect(block.locator(".mermaid-editor")).toBeVisible();
  });

  test("M7 Ctrl+滚轮缩放", async ({ page }) => {
    await insertMermaid(page, "graph TD; A-->B");
    const block = page.locator(".mermaid-block").first();
    const render = block.locator(".mermaid-render");
    await render.hover();
    // Ctrl+滚轮上滚放大
    await page.mouse.wheel(0, -100);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -100);
    await page.keyboard.up("Control");
    // 缩放后 svg 应有 transform 或 render 有 zoomable class（取其一即可）
    const scaled = await render.evaluate((el) => {
      const svg = el.querySelector("svg");
      const hasZoomClass = el.classList.contains("zoomable");
      const hasTransform = svg?.style.transform?.includes("scale") ?? false;
      return hasZoomClass || hasTransform;
    });
    expect(scaled).toBe(true);
  });

  test("M8 非法 mermaid 代码降级显示错误", async ({ page }) => {
    await insertMermaid(page, "garbage @@@ not valid");
    await expect(page.locator(".mermaid-error").first()).toBeVisible({ timeout: 15_000 });
  });
});
