// E2E：[TOC] 目录自动生成
// 覆盖：TOC 块渲染、目录项、标题跳转、层级缩进、空状态
//
// #358：TOC3 原断言是 `typeof after === "number"`（恒真，`before` 还被 `void` 丢弃）；
// TOC4 在「目录项已存在、层级缩进尚未生效」时采样，高并发下会偶发假红。
// 这里改为：TOC3 用「与目标标题预期落点比较」，TOC4 用轮询等缩进真正生效。

import { test, expect, type Page } from "@playwright/test";
import { openMockWorkspace, openFile, waitScrollConverged } from "./helpers";

const TARGET_HEADING = "目标标题";
/** 允许的最终滚动位置误差（smooth 滚动 + 分数像素） */
const SCROLL_TOLERANCE = 60;

async function readScrollTop(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector(".editor-scroll");
    return el ? el.scrollTop : -1;
  });
}

test.describe("TOC 目录", () => {
  test.beforeEach(async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "toc-demo.md");
  });

  test("TOC1 TOC 块渲染", async ({ page }) => {
    const block = page.locator(".toc-block");
    await expect(block).toBeVisible({ timeout: 10_000 });
    await expect(block.locator(".toc-label")).toContainText("目录");
  });

  test("TOC2 目录项与文档标题对应", async ({ page }) => {
    await expect(page.locator(".toc-block")).toBeVisible({ timeout: 10_000 });
    const items = page.locator(".toc-list .toc-item");
    // toc-demo.md 有 H1 + 两个 H2，TOC 应列出标题
    expect(await items.count()).toBeGreaterThanOrEqual(2);
    await expect(items.filter({ hasText: "二级标题 A" })).toBeVisible();
    await expect(items.filter({ hasText: "二级标题 B" })).toBeVisible();
  });

  test("TOC3 目录项可点击跳转（按目标标题预期落点断言）", async ({ page }) => {
    // toc-demo.md 的目标都在首屏（scrollTop 恒 0），必须换成长文档才可观测滚动
    await openFile(page, "toc-long.md");
    await expect(page.locator(".toc-block")).toBeVisible({ timeout: 10_000 });

    const targetItem = page
      .locator(".toc-list .toc-item a")
      .filter({ hasText: TARGET_HEADING });
    await expect(targetItem).toBeVisible();

    // 目标标题相对滚动容器内容顶部的文档偏移（与当前滚动量无关）
    const before = await page.evaluate((headingText) => {
      const scroll = document.querySelector(".editor-scroll") as HTMLElement | null;
      if (!scroll) return null;
      const containerRect = scroll.getBoundingClientRect();
      const heading = Array.from(document.querySelectorAll(".ProseMirror h2")).find(
        (el) => (el.textContent ?? "").trim() === headingText,
      );
      if (!heading) return null;
      return {
        scrollTop: scroll.scrollTop,
        maxScroll: scroll.scrollHeight - scroll.clientHeight,
        docTop: heading.getBoundingClientRect().top - containerRect.top + scroll.scrollTop,
      };
    }, TARGET_HEADING);
    expect(before).not.toBeNull();

    // 点击目标对齐容器顶；文档末尾滚动受限时取 maxScroll
    const expected = Math.min(before!.docTop, before!.maxScroll);
    // 前置条件：目标必须在首屏之外，否则「是否滚动」无从观测
    expect(expected).toBeGreaterThan(before!.scrollTop + 100);

    await targetItem.click();
    await waitScrollConverged(page, ".editor-scroll", 10_000);

    const actual = await readScrollTop(page);
    expect(
      Math.abs(actual - expected),
      `应滚到「${TARGET_HEADING}」（预期 ${expected}，实际 ${actual}）`,
    ).toBeLessThanOrEqual(SCROLL_TOLERANCE);

    // 目标标题必须真的进入视口
    const headingInViewport = await page.evaluate((headingText) => {
      const heading = Array.from(document.querySelectorAll(".ProseMirror h2")).find(
        (el) => (el.textContent ?? "").trim() === headingText,
      );
      if (!heading) return false;
      const top = heading.getBoundingClientRect().top;
      return top >= -1 && top < window.innerHeight;
    }, TARGET_HEADING);
    expect(headingInViewport).toBe(true);
  });

  test("TOC4 目录项有层级缩进（轮询等样式生效）", async ({ page }) => {
    await expect(page.locator(".toc-block")).toBeVisible({ timeout: 10_000 });
    const items = page.locator(".toc-list .toc-item");

    // 「目录项已存在」不等于「层级缩进已生效」；必须轮询到 H2 的缩进真正大于 H1。
    // 直接采样在高并发下会读到「列表已渲染、样式尚未计算」的中间态（#358 实测假红）。
    await expect
      .poll(
        async () => {
          const pads = await items.evaluateAll((els) =>
            els.map((el) => parseFloat(getComputedStyle(el).paddingLeft)),
          );
          return pads.length >= 2 && pads[0] === 0 && pads[1] > 0;
        },
        { timeout: 10_000, intervals: [50, 100, 150, 200] },
      )
      .toBe(true);
  });

  test("TOC5 编辑标题后目录项实时刷新", async ({ page }) => {
    const heading = page.locator(".ProseMirror h2", { hasText: "二级标题 A" });
    await heading.click();
    await page.keyboard.press("End");
    await page.keyboard.type("（已更新）");

    await expect(
      page.locator(".toc-list .toc-item", { hasText: "二级标题 A（已更新）" }),
    ).toBeVisible();
  });
});
