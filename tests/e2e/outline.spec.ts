// E2E：大纲面板
// 覆盖：显隐、内容渲染、层级缩进、点击跳转、自动跟随、空状态
//
// 注意：大纲面板默认可见（store/ui.ts 中 outlineVisible 初值为 true），
// 直接断言即可；Ctrl+' 是「切换」而非「打开」，无脑按一次会把面板隐藏导致用例失败。
// 若前置操作可能关闭了面板，用 ensureOutlineVisible 兜底。

import { test, expect, type Page } from "@playwright/test";
import { openMockWorkspace, openFile, moveCaretToDocEnd, MOD } from "./helpers";

async function ensureOutlineVisible(page: Page) {
  const visible = await page.locator(".outline-panel").isVisible().catch(() => false);
  if (!visible) {
    await page.keyboard.press(`${MOD}+'`);
    await expect(page.locator(".outline-panel")).toBeVisible({ timeout: 5_000 });
  }
}

test.describe("大纲面板", () => {
  test.beforeEach(async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
  });

  test("O1 打开文件后大纲显示标题", async ({ page }) => {
    await ensureOutlineVisible(page);
    // readme.md 有 H1 "Readme"
    const items = page.locator(".outline-item");
    expect(await items.count()).toBeGreaterThanOrEqual(1);
    await expect(items.first()).toContainText("Readme");
    await expect(items.first()).toHaveClass(/outline-h1/);
  });

  test("O2 多级标题层级与缩进", async ({ page }) => {
    // outline-demo.md 内含 H1/H2/H3 三级标题，直接打开验证（避免 keyboard 输入
    // "##"/"###" 依赖 Control+End 定位，在列表/代码块等节点内会不稳定）
    await openFile(page, "outline-demo.md");
    await ensureOutlineVisible(page);
    await expect(page.locator(".outline-item.outline-h1")).toHaveCount(1);
    await expect(page.locator(".outline-item.outline-h2")).toHaveCount(1);
    await expect(page.locator(".outline-item.outline-h3")).toHaveCount(1);
    // 缩进：h2 paddingLeft > h1，h3 > h2
    const h1Pad = await page.locator(".outline-item.outline-h1").evaluate((el) => getComputedStyle(el).paddingLeft);
    const h2Pad = await page.locator(".outline-item.outline-h2").evaluate((el) => getComputedStyle(el).paddingLeft);
    const h3Pad = await page.locator(".outline-item.outline-h3").evaluate((el) => getComputedStyle(el).paddingLeft);
    expect(parseFloat(h2Pad)).toBeGreaterThan(parseFloat(h1Pad));
    expect(parseFloat(h3Pad)).toBeGreaterThan(parseFloat(h2Pad));
  });

  test("O3 点击大纲项滚动并高亮", async ({ page }) => {
    // 追加多标题
    await page.locator(".ProseMirror").click();
    await moveCaretToDocEnd(page);
    await page.keyboard.press("Enter");
    await page.keyboard.type("## 第二段");
    await page.keyboard.press("Enter");
    await page.keyboard.type("内容内容内容");
    await page.keyboard.press("Enter");
    await page.keyboard.type("## 第三段");
    await ensureOutlineVisible(page);
    const scrollTopBefore = await page.locator(".editor-scroll").evaluate((el) => el.scrollTop);
    // 点击最后一个大纲项
    const lastItem = page.locator(".outline-item").last();
    await lastItem.click();
    // 等待 280ms 滚动动画
    await page.waitForTimeout(400);
    const scrollTopAfter = await page.locator(".editor-scroll").evaluate((el) => el.scrollTop);
    // 滚动位置应有变化（或已到底）
    expect(scrollTopAfter).not.toBe(scrollTopBefore);
  });

  test("O4 单标题文件大纲只有一项", async ({ page }) => {
    await openFile(page, "intro.md");
    await ensureOutlineVisible(page);
    await expect(page.locator(".outline-item")).toHaveCount(1);
  });

  test("O5 空草稿显示空状态", async ({ page }) => {
    // 新建草稿（Ctrl+N）
    await page.keyboard.press(`${MOD}+n`);
    await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 5_000 });
    await ensureOutlineVisible(page);
    await expect(page.locator(".outline-empty")).toBeVisible();
    await expect(page.locator(".outline-empty")).toContainText("文档暂无标题");
  });

  test("O6 正文滚动到后部章节时大纲自动跟随", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 480 });
    await page.keyboard.press(`${MOD}+n`);
    const editor = page.locator(".ProseMirror");
    await editor.click();

    for (let index = 1; index <= 24; index += 1) {
      await page.keyboard.type(`## 自动跟随 ${index}`);
      await page.keyboard.press("Enter");
    }
    await expect(page.locator(".outline-item")).toHaveCount(24);

    // 先把光标和大纲恢复到文档顶部，再只滚动正文容器；纯滚动不会
    // 产生 ProseMirror transaction，必须由视口跟踪监听器更新章节。
    // 用点击首个标题定位（平台无关）：macOS 上 Ctrl+Home 无移动光标
    // 语义（issue #36），且点击标题能同时把大纲切到第一章。
    await editor.locator("h1, h2, h3, h4, h5, h6").first().click();
    await expect(page.locator(".outline-item-active")).toContainText(
      "自动跟随 1",
    );

    // .milkdown 顶部有 2.5rem padding；小幅滚动时采样点仍需限制在
    // ProseMirror DOM 内，不能把首个标题的高亮短暂清空。
    await page.locator(".editor-scroll").evaluate((scroller) => {
      scroller.scrollTop = 4;
      scroller.dispatchEvent(new Event("scroll"));
    });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(page.locator(".outline-item-active")).toContainText(
      "自动跟随 1",
    );

    await editor
      .locator("h1, h2, h3, h4, h5, h6")
      .nth(12)
      .evaluate((heading) => {
        const scroller = heading.closest<HTMLElement>(".editor-scroll");
        if (!scroller) throw new Error("editor scroller not found");
        const headingRect = heading.getBoundingClientRect();
        const scrollerRect = scroller.getBoundingClientRect();
        scroller.scrollTop += headingRect.top - scrollerRect.top;
        scroller.dispatchEvent(new Event("scroll"));
      });

    await expect.poll(async () => {
      const text = await page.locator(".outline-item-active").textContent();
      return Number(text?.match(/自动跟随 (\d+)/)?.[1] ?? 0);
    }).toBe(13);

    // 中部章节前后都有足够项目时，高亮项应停在大纲可视区中央，
    // 而不是仅以最短距离滚进可视区。
    await expect.poll(async () => {
      const treeRect = await page.locator(".outline-tree").boundingBox();
      const itemRect = await page.locator(".outline-item-active").boundingBox();
      if (!treeRect || !itemRect) return Number.POSITIVE_INFINITY;
      const treeCenter = treeRect.y + treeRect.height / 2;
      const itemCenter = itemRect.y + itemRect.height / 2;
      return Math.abs(treeCenter - itemCenter);
    }).toBeLessThan(2);
  });
});
