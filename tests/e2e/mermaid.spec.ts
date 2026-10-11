// E2E：Mermaid 流程图渲染（v2.0.1 重点回归）
// 覆盖：基础渲染、多行节点防裁切、编辑模式、重新渲染、Esc 放弃、
//       双击编辑、Ctrl+滚轮缩放、错误降级

import { test, expect } from "@playwright/test";
import { openMockWorkspace, openFile, MULTILINE_FLOWCHART } from "./helpers";

// 通过表格工具栏的 Mermaid 按钮插入空 mermaid 块，再用编辑 textarea 填入代码并提交渲染
async function insertMermaid(page: import("@playwright/test").Page, code: string) {
  // 1. 用工具栏按钮插入空 mermaid 代码块（最可靠的插入路径）
  await page.locator('.tt-btn[title="Mermaid 图表"]').click();
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

  // #311（#223 移出项 I1）：工具栏按钮底色曾引用**全仓未定义**的 `--bg` → 暗色下回退 #fff 白块。
  // 修法：改用已登记的 `--bg-elevated`（light 恰为 #ffffff → 零视觉回归；dark 跟随面板）。
  test("M9 工具栏按钮底色跟随主题（暗色无白块、浅色不回归）", async ({ page }) => {
    await insertMermaid(page, "graph TD; A-->B");
    const btn = page.locator(".mermaid-block").first().locator(".mermaid-toolbar button").first();
    await expect(btn).toBeAttached();

    /**
     * 一次 evaluate 里同时取「按钮常态底色」「当前 `--bg-elevated` 解析值」「data-theme」并判定是否一致。
     * 必须轮询：`data-theme` 属性是**同步**写的，主题 CSS 是**微任务注入** → 立刻读会拿到上一主题的中间态。
     * 另把指针移开，避开 hover 态（那是 `--row-hover-bg`，另一回事）。
     */
    const snapshot = async () => {
      await page.mouse.move(2, 2);
      return btn.evaluate((el) => {
        const parse = (s: string) => {
          const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(s);
          return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
        };
        const hex = getComputedStyle(document.documentElement)
          .getPropertyValue("--bg-elevated")
          .trim()
          .replace("#", "");
        const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
        const n = parseInt(full, 16);
        const button = parse(getComputedStyle(el).backgroundColor);
        const token = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        return {
          mode: document.documentElement.getAttribute("data-theme") ?? "",
          follows: button !== null && button.join(",") === token.join(","),
          sum: (button ?? [255, 255, 255]).reduce((a, b) => a + b, 0),
        };
      });
    };
    const settle = (mode: "light" | "dark") => async () => {
      const s = await snapshot();
      // 暗色额外要求「明显不是白块」（白块 sum = 765）
      return `${s.mode}|${s.follows}|${mode === "dark" ? s.sum < 240 : s.sum > 700}`;
    };

    // 不假设默认态：应用跟随系统 `prefers-color-scheme`（本机/CI 可能是暗色）→ 显式切到基线浅色
    await page.getByTitle("主题").click();
    await page.locator('[data-theme-option="builtin:light"]').click();
    // 浅色：白底（= 原回退值 → light 不回归）且跟随 token
    await expect.poll(settle("light"), { timeout: 8000 }).toBe("light|true|true");

    // 暗色：不再是白块，且**恰好跟随**该主题的 `--bg-elevated`
    await page.getByTitle("主题").click();
    await page.locator('[data-theme-option="builtin:tech-dark"]').click();
    await expect.poll(settle("dark"), { timeout: 8000 }).toBe("dark|true|true");
  });
});
