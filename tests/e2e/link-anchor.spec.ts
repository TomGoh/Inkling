// E2E：锚点匹配（#297）
//
// 本 spec 的**增量价值**只有两类，其余是防回归：
// 1) 重复标题的序号后缀：`#hello-world-1`、`#Hello, World!-1`、`#重复标题-1`、`#重复标题-#1`
//    必须滚到**第 2 处**（旧匹配器只做 slug 相等，不解析序号）；
// 2) URL 编码锚点：`#%E7%90%86…` 必须先解码再匹配（旧匹配器不解码）。
//
// 中文同文本、含标点单发、`#v20-release` 这些形态在本批次之前就能命中，**不能**当作
// 「本次新增能力」的证据，只作为防回归。
//
// 本 spec 不使用任何 workspace-file 形态的链接（`x.md#frag` / 自链接）：那属于 #296 的
// workspace-file 臂，本批次尚未落地，断言必红。

import { test, expect, type Page } from "@playwright/test";
import { openMockWorkspace, openFile, MOD, waitScrollConverged } from "./helpers";

const CLICK_MODIFIER = MOD === "Meta" ? "Meta" : "Control";
const ANCHOR_DEMO_FILE = "link-anchor-demo.md";
/** 允许的最终滚动位置误差（smooth 滚动 + 分数像素） */
const SCROLL_TOLERANCE = 60;

interface AnchorGeometry {
  scrollTop: number;
  maxScroll: number;
  /** 同名标题相对滚动容器内容顶部的文档偏移（不随当前滚动位置变化） */
  docTops: number[];
}

/**
 * 读取滚动位置与同名标题的**文档偏移**。
 *
 * 文档偏移 = `rect.top - containerRect.top + scrollTop`，它与当前滚动量无关，
 * 因此可以在点击前采一次，再与点击后的 `scrollTop` 直接比较。
 */
async function readAnchorGeometry(page: Page, headingText: string): Promise<AnchorGeometry> {
  return page.evaluate((text) => {
    const scroll = document.querySelector(".editor-scroll") as HTMLElement | null;
    if (!scroll) return { scrollTop: -1, maxScroll: -1, docTops: [] };
    const containerRect = scroll.getBoundingClientRect();
    const headings = Array.from(document.querySelectorAll(".ProseMirror h2")).filter(
      (el) => (el.textContent ?? "").trim() === text,
    );
    return {
      scrollTop: scroll.scrollTop,
      maxScroll: scroll.scrollHeight - scroll.clientHeight,
      docTops: headings.map(
        (el) => el.getBoundingClientRect().top - containerRect.top + scroll.scrollTop,
      ),
    };
  }, headingText);
}

async function readScrollTop(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector(".editor-scroll");
    return el ? el.scrollTop : -1;
  });
}

/**
 * 锚点滚动的预期落点：让目标标题顶边对齐滚动容器顶边；文档末尾滚动受限时取 maxScroll。
 */
function expectedScrollTop(geometry: AnchorGeometry, occurrence: number): number {
  return Math.min(geometry.docTops[occurrence], geometry.maxScroll);
}

/**
 * Ctrl/Cmd+点击锚点链接，断言最终滚动位置等于**指定 occurrence** 的预期落点。
 *
 * 为什么不用「目标标题是否进入视口」做判据：重复标题彼此只隔几行，滚到第 2 处时
 * 第 1 处往往仍在视口内；而文档末尾受限时目标也到不了顶部。用「与第 k 处预期落点
 * 的差」才能唯一区分「滚到第 1 处」与「滚到第 2 处」。
 */
async function expectAnchorScroll(
  page: Page,
  href: string,
  headingText: string,
  occurrence = 0,
) {
  const link = page.locator(`.ProseMirror a[href="${href}"]`);
  await expect(link).toBeVisible({ timeout: 10_000 });
  // 先让 Playwright 完成自己的 scrollIntoViewIfNeeded，再取基线，
  // 避免把「点击前的自动滚动」算成应用行为（与 #299 L3b 同一教训）。
  await link.scrollIntoViewIfNeeded();

  const before = await readAnchorGeometry(page, headingText);
  expect(before.docTops.length, `「${headingText}」标题数量不足`).toBeGreaterThan(occurrence);

  const targetScroll = expectedScrollTop(before, occurrence);
  const baseline = await readScrollTop(page);
  // fixture 前置条件：目标不在首屏，否则「是否滚动」无从观测
  expect(targetScroll).toBeGreaterThan(baseline + 100);

  await link.click({ modifiers: [CLICK_MODIFIER] });
  // smooth 滚动是动画：必须等滚动真正收敛再比较，否则会读到动画中间态
  await waitScrollConverged(page, ".editor-scroll", 10_000);

  const actual = await readScrollTop(page);
  expect(
    Math.abs(actual - targetScroll),
    `应滚到「${headingText}」第 ${occurrence + 1} 处（预期 ${targetScroll}，实际 ${actual}）`,
  ).toBeLessThanOrEqual(SCROLL_TOLERANCE);

  // 反证：不能落在其它同名标题的预期落点上
  for (let i = 0; i < before.docTops.length; i++) {
    if (i === occurrence) continue;
    const otherScroll = expectedScrollTop(before, i);
    if (Math.abs(otherScroll - targetScroll) <= SCROLL_TOLERANCE) continue;
    expect(
      Math.abs(actual - otherScroll),
      `不应滚到「${headingText}」第 ${i + 1} 处（该落点 ${otherScroll}）`,
    ).toBeGreaterThan(SCROLL_TOLERANCE);
  }
}

test.describe("锚点匹配", () => {
  test.beforeEach(async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, ANCHOR_DEMO_FILE);
  });

  test("A1 中文同文本锚点（防回归）", async ({ page }) => {
    await expectAnchorScroll(page, "#理解问题与方法", "理解问题与方法");
  });

  test("A2 含标点标题的 slug 形态（防回归）", async ({ page }) => {
    await expectAnchorScroll(page, "#hello-world", "Hello, World!", 0);
  });

  test("A3 重复含标点标题：GitHub 序号 `-1` 命中第 2 处", async ({ page }) => {
    await expectAnchorScroll(page, "#hello-world-1", "Hello, World!", 1);
  });

  test("A4 重复含标点标题：GitHub 原始文本 + 序号命中第 2 处", async ({ page }) => {
    await expectAnchorScroll(page, "#Hello,%20World!-1", "Hello, World!", 1);
  });

  test("A5 重复中文标题：第 1 处（防回归）", async ({ page }) => {
    await expectAnchorScroll(page, "#重复标题", "重复标题", 0);
  });

  test("A6 重复中文标题：GitHub 形 `-1` 命中第 2 处", async ({ page }) => {
    await expectAnchorScroll(page, "#重复标题-1", "重复标题", 1);
  });

  test("A7 重复中文标题：Milkdown 真实 id 形 `-#2` 命中第 2 处", async ({ page }) => {
    // 上游 syncHeadingIdPlugin 的计数是 1-based：第 2 处是 `-#2`（不是 `-#1`）
    await expectAnchorScroll(page, "#重复标题-#2", "重复标题", 1);
  });

  test("A8 版本号标题 `v2.0 release` → `#v20-release`（防回归）", async ({ page }) => {
    await expectAnchorScroll(page, "#v20-release", "v2.0 release");
  });

  test("A9 URL 编码锚点先解码再匹配", async ({ page }) => {
    await expectAnchorScroll(
      page,
      "#%E7%90%86%E8%A7%A3%E9%97%AE%E9%A2%98%E4%B8%8E%E6%96%B9%E6%B3%95",
      "理解问题与方法",
    );
  });

  test("A11 标题 DOM id 与应用 slug 统一（headingIdGenerator 覆写生效）", async ({ page }) => {
    const ids = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".ProseMirror h2")).map((el) => ({
        text: (el.textContent ?? "").trim(),
        id: el.id,
      })),
    );

    // 默认生成器只替换空白、保留标点，产出 `hello,-world!`；覆写后应为 slug
    expect(ids).toContainEqual({ text: "Hello, World!", id: "hello-world" });
    // 去重后缀仍由上游 syncHeadingIdPlugin 追加；其计数是 1-based，第 2 处为 `-#2`
    expect(ids).toContainEqual({ text: "Hello, World!", id: "hello-world-#2" });
    expect(ids.some((item) => item.id === "hello-world-1")).toBe(false);
  });

  test("A10 不存在的锚点：不滚动、不提示、不改 URL/hash", async ({ page }) => {
    const link = page.locator('.ProseMirror a[href="#不存在的锚点"]');
    await expect(link).toBeVisible({ timeout: 10_000 });
    await link.scrollIntoViewIfNeeded();

    const baseline = await readScrollTop(page);
    const urlBefore = page.url();

    await link.click({ modifiers: [CLICK_MODIFIER] });
    await page.waitForTimeout(600);

    expect(await readScrollTop(page)).toBe(baseline);
    expect(page.url()).toBe(urlBefore);
    expect(await page.evaluate(() => window.location.hash)).toBe("");
    // 锚点未命中必须静默（不得弹「不支持」类提示）
    await expect(page.locator(".md-editor-link-notice")).toHaveCount(0);
  });
});
