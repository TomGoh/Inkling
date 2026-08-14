// E2E：多标签切换时编辑位置（光标/滚动）记忆（issue #30）
// 覆盖：滚动位置不跨文件串扰、切回各自恢复记忆位置、大纲与可视区一致
//
// 长文档通过新建草稿 + 键入标题生成，避免改动共享 mock 工作区 fixture。
// 注意：cursor-saver 只在 ProseMirror transaction 时落盘，纯滚动不产生
// transaction，所以「滚动后点击目标标题」是记录滚动位置的必要步骤。

import { test, expect, type Page } from "@playwright/test";
import { openMockWorkspace, MOD } from "./helpers";

const HEADING_COUNT = 20;

async function ensureOutlineVisible(page: Page) {
  const visible = await page.locator(".outline-panel").isVisible().catch(() => false);
  if (!visible) {
    await page.keyboard.press(`${MOD}+'`);
    await expect(page.locator(".outline-panel")).toBeVisible({ timeout: 5_000 });
  }
}

async function nextFrames(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

/** 新建草稿并键入 HEADING_COUNT 个「## 章节 N」+ 正文段落，构成可滚动长文档 */
async function newLongDraft(page: Page) {
  await page.keyboard.press(`${MOD}+n`);
  const editor = page.locator(".ProseMirror");
  await expect(editor).toBeVisible({ timeout: 5_000 });
  await editor.click();
  for (let i = 1; i <= HEADING_COUNT; i += 1) {
    await page.keyboard.type(`## 章节 ${i}`);
    await page.keyboard.press("Enter");
    await page.keyboard.type(`第 ${i} 章正文内容，用来撑开滚动高度。`);
    await page.keyboard.press("Enter");
  }
}

/**
 * 把正文滚动到第 headingIndex 个 H2（1 基）位于视口顶部，
 * 并点击该标题产生一次 selection transaction，让 cursor-saver
 * 以滚动后的 scrollTop 落盘。
 */
async function scrollToHeading(page: Page, headingIndex: number) {
  const heading = page.locator(".ProseMirror h2").nth(headingIndex - 1);
  await heading.evaluate((el) => {
    const scrollerEl = el.closest<HTMLElement>(".editor-scroll");
    if (!scrollerEl) throw new Error("editor scroller not found");
    const headingRect = el.getBoundingClientRect();
    const scrollerRect = scrollerEl.getBoundingClientRect();
    scrollerEl.scrollTop += headingRect.top - scrollerRect.top - 8;
    scrollerEl.dispatchEvent(new Event("scroll"));
  });
  await nextFrames(page);
  await heading.click();
  await nextFrames(page);
}

const scrollTopOf = (page: Page) =>
  page.locator(".editor-scroll").first().evaluate((el) => el.scrollTop);

/**
 * 按 outline-tracker 的视口采样逻辑（scroller 顶部 +12px 处最后一个已越过的
 * 标题）推导当前可视章节文本，用于断言「大纲高亮与编辑区可视章节一致」。
 */
function viewportChapterText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".editor-scroll");
    if (!scroller) return "";
    const sampleTop = scroller.getBoundingClientRect().top + 12;
    const headings = Array.from(
      scroller.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"),
    );
    let active: HTMLElement | null = null;
    for (const h of headings) {
      const r = h.getBoundingClientRect();
      if (r.top <= sampleTop + 1) active = h;
      else break;
    }
    const el = active ?? headings[0];
    return el?.textContent?.trim() ?? "";
  });
}

/** 大纲高亮最终必须与视口推导出的章节一致（issue #30 的「大纲不同步」症状） */
async function expectOutlineMatchesViewport(page: Page) {
  await expect
    .poll(async () => {
      const outlineText =
        (await page.locator(".outline-item-active").textContent())?.trim() ?? "";
      const visible = await viewportChapterText(page);
      return visible !== "" && outlineText === visible;
    }, { timeout: 5_000 })
    .toBe(true);
}

test.describe("多标签滚动/光标记忆（issue #30）", () => {
  test.beforeEach(async ({ page }) => {
    // 小视口：20 章草稿足以产生可观滚动范围
    await page.setViewportSize({ width: 1280, height: 400 });
    await openMockWorkspace(page);
  });

  test("切回标签页各自恢复记忆的滚动位置，互不串扰，大纲一致", async ({ page }) => {
    // 草稿 1：输入完成后停在文档底部
    await newLongDraft(page);
    await ensureOutlineVisible(page);
    const scrollTop1 = await scrollTopOf(page);
    expect(scrollTop1).toBeGreaterThan(500);
    // 等记忆防抖落盘（300ms）
    await page.waitForTimeout(450);

    // 草稿 2：同样输入到文档底部
    await newLongDraft(page);
    const scrollTop2Bottom = await scrollTopOf(page);
    expect(scrollTop2Bottom).toBeGreaterThan(500);

    // 草稿 2 滚动并点击「章节 5」，记录一个靠前的滚动位置并与落盘时机对齐
    await scrollToHeading(page, 5);
    const scrollTop2 = await scrollTopOf(page);
    expect(scrollTop2).toBeGreaterThan(100);
    expect(scrollTop2).toBeLessThan(scrollTop2Bottom - 200);
    await expect(page.locator(".outline-item-active")).toContainText("章节 5");
    await page.waitForTimeout(450);

    // 切回草稿 1（标签栏显示「未命名 1」）：必须恢复草稿 1 自己的底部位置，
    // 而不是草稿 2 的「章节 5」位置。串扰时这里会显示 ~scrollTop2。
    await page.locator(".tab", { hasText: "未命名 1" }).click();
    await expect
      .poll(() => scrollTopOf(page), { timeout: 5_000 })
      .toBeGreaterThan(scrollTop1 - 50);
    const restored1 = await scrollTopOf(page);
    expect(Math.abs(restored1 - scrollTop1)).toBeLessThan(50);
    await expectOutlineMatchesViewport(page);

    // 再切回草稿 2：必须恢复草稿 2 的「章节 5」位置，
    // 而不是草稿 1 的底部位置。串扰时这里会显示 ~scrollTop1。
    await page.locator(".tab", { hasText: "未命名 2" }).click();
    await expect
      .poll(() => scrollTopOf(page), { timeout: 5_000 })
      .toBeLessThan(scrollTop2 + 50);
    const restored2 = await scrollTopOf(page);
    expect(Math.abs(restored2 - scrollTop2)).toBeLessThan(50);
    await expectOutlineMatchesViewport(page);
  });
});
