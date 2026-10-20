// E2E：相对路径 / 工作区文件链接（#296）
//
// 覆盖：打开同目录/上级/带锚点文件、自链接（含分屏）、打开失败提示、非 md、越界、
// 百分号编码空格、Markdown 源码 href 保真。
//
// 判据要点：
// - 「打开并滚动」必须等到目标标题真的进入视口且 scrollTop > 100；
// - 自链接必须同时断言 tab 数与活跃 tab 不变（否则测不出「重开/抢 tab」）；
// - 失败用例必须断言提示文案 + tab 数不变。

import { test, expect, type Page } from "@playwright/test";
import { openMockWorkspace, openFile, MOD } from "./helpers";

const CLICK_MODIFIER = MOD === "Meta" ? "Meta" : "Control";
const DEMO_FILE = "link-relative.md";
const MAIN_SCROLL = ".editor-scroll:not(.editor-scroll-split-pane)";
const SPLIT_SCROLL = ".split-pane .editor-scroll";

function linkIn(page: Page, href: string, scope = ".ProseMirror") {
  return page.locator(`${scope} a[href="${href}"]`);
}

async function ctrlClick(locator: ReturnType<Page["locator"]>) {
  await locator.scrollIntoViewIfNeeded();
  await locator.click({ modifiers: [CLICK_MODIFIER] });
}

async function tabCount(page: Page): Promise<number> {
  return page.locator(".tabs-bar .tab").count();
}

/** 轮询直到某个滚动容器里的同名标题进入视口，且确实发生了滚动 */
async function expectScrolledToHeading(
  page: Page,
  scrollSelector: string,
  headingText: string,
) {
  await expect
    .poll(
      async () =>
        page.evaluate(
          ({ selector, text }) => {
            const scroll = document.querySelector(selector);
            if (!scroll) return false;
            const heading = Array.from(scroll.querySelectorAll(".ProseMirror h2")).find(
              (el) => (el.textContent ?? "").trim() === text,
            );
            if (!heading) return false;
            const top = heading.getBoundingClientRect().top;
            return scroll.scrollTop > 100 && top >= -1 && top < window.innerHeight;
          },
          { selector: scrollSelector, text: headingText },
        ),
      { timeout: 10_000, intervals: [100, 150, 200] },
    )
    .toBe(true);
}

test.describe("相对路径链接", () => {
  test.beforeEach(async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, DEMO_FILE);
  });

  test("R1 同目录链接打开目标文件（新增 tab）", async ({ page }) => {
    expect(await tabCount(page)).toBe(1);
    await ctrlClick(linkIn(page, "readme.md"));

    await expect(page.locator(".tab-active")).toContainText("readme.md", { timeout: 10_000 });
    expect(await tabCount(page)).toBe(2);
  });

  test("R2 上级目录链接打开 ../intro.md", async ({ page }) => {
    await ctrlClick(linkIn(page, "../intro.md"));

    await expect(page.locator(".tab-active")).toContainText("intro.md", { timeout: 10_000 });
    expect(await tabCount(page)).toBe(2);
  });

  test("R3 带锚点链接：打开文件并滚到标题", async ({ page }) => {
    await ctrlClick(linkIn(page, "link-anchor-demo.md#hello-world"));

    await expect(page.locator(".tab-active")).toContainText("link-anchor-demo.md", {
      timeout: 10_000,
    });
    // 目标标题在首屏之外；打开后必须由 pending-anchor 消费端滚动过去
    await expectScrolledToHeading(page, MAIN_SCROLL, "Hello, World!");
    expect(await tabCount(page)).toBe(2);
  });

  test("R4 自链接：只滚动，不重开 tab、不切换活跃文件", async ({ page }) => {
    const before = await tabCount(page);
    await ctrlClick(linkIn(page, "link-relative.md#相对小节"));

    await expectScrolledToHeading(page, MAIN_SCROLL, "相对小节");
    expect(await tabCount(page)).toBe(before);
    await expect(page.locator(".tab-active")).toContainText(DEMO_FILE);
    await expect(page.locator(".md-editor-link-notice")).toHaveCount(0);
  });

  test("R5 分屏自链接：滚动分屏，不抢主 tab", async ({ page }) => {
    // 主面板切到 readme，分屏展示 link-relative（splitOpen 不允许与主面板同文件）
    await openFile(page, "readme.md");
    const demoTab = page.locator(".tabs-bar .tab", { hasText: DEMO_FILE });
    await demoTab.click({ button: "right" });
    await page.locator(".tab-context-item", { hasText: "在分屏打开" }).click();
    await expect(page.locator(".split-pane .ProseMirror")).toBeVisible({ timeout: 10_000 });

    const tabsBefore = await tabCount(page);
    await ctrlClick(linkIn(page, "link-relative.md#相对小节", ".split-pane .ProseMirror"));

    await expectScrolledToHeading(page, SPLIT_SCROLL, "相对小节");
    // 主面板不能被分屏里的自链接抢走，也不能多出 tab
    await expect(page.locator(".tab-active")).toContainText("readme.md");
    expect(await tabCount(page)).toBe(tabsBefore);
  });

  test("R6 目标不存在：提示「无法打开」，不新增 tab", async ({ page }) => {
    const before = await tabCount(page);
    await ctrlClick(linkIn(page, "nope.md"));

    await expect(page.locator(".md-editor-link-notice")).toContainText("无法打开", {
      timeout: 5_000,
    });
    await expect(page.locator(".md-editor-link-notice")).toContainText("文件不存在");
    await page.waitForTimeout(500);
    expect(await tabCount(page)).toBe(before);
    await expect(page.locator(".tab-active")).toContainText(DEMO_FILE);
  });

  test("R7 非 Markdown 目标：提示「仅支持打开 Markdown 文件」", async ({ page }) => {
    const before = await tabCount(page);
    await ctrlClick(linkIn(page, "attachment.txt"));

    await expect(page.locator(".md-editor-link-notice")).toHaveText(
      "仅支持打开 Markdown 文件",
      { timeout: 5_000 },
    );
    expect(await tabCount(page)).toBe(before);
  });

  test("R8 越出工作区：提示「链接目标不在工作区内」", async ({ page }) => {
    const before = await tabCount(page);
    await ctrlClick(linkIn(page, "../../outside.md"));

    await expect(page.locator(".md-editor-link-notice")).toHaveText(
      "链接目标不在工作区内",
      { timeout: 5_000 },
    );
    expect(await tabCount(page)).toBe(before);
  });

  test("R9 百分号编码空格：打开 `my note.md`", async ({ page }) => {
    await ctrlClick(linkIn(page, "my%20note.md"));

    await expect(page.locator(".tab-active")).toContainText("my note.md", {
      timeout: 10_000,
    });
    expect(await tabCount(page)).toBe(2);
  });

  test("R11 html 相对链接：属性保留且 Ctrl+点击打开目标", async ({ page }) => {
    // #360 窄口径：渲染模式仅对 <a href> 放行无协议相对值
    await openFile(page, "link-html-demo.md");
    const link = page.locator('.html-inline a[href="readme.md"]');
    await expect(link).toBeVisible({ timeout: 10_000 });
    const before = await tabCount(page);

    await ctrlClick(link);

    await expect(page.locator(".tab-active")).toContainText("readme.md", { timeout: 10_000 });
    expect(await tabCount(page)).toBe(before + 1);
  });

  test("R12 html 相对链接裸点击：不导航、不新增 tab", async ({ page }) => {
    await openFile(page, "link-html-demo.md");
    const link = page.locator('.html-inline a[href="readme.md"]');
    await expect(link).toBeVisible({ timeout: 10_000 });

    const navigations: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigations.push(frame.url());
    });
    const before = await tabCount(page);
    const urlBefore = page.url();

    await link.click();
    await page.waitForTimeout(400);

    expect(navigations).toEqual([]);
    expect(page.url()).toBe(urlBefore);
    expect(await page.evaluate(() => window.location.hash)).toBe("");
    expect(await tabCount(page)).toBe(before);
  });

  test("R13 html 相对链接目标不存在：提示「无法打开」，不新增 tab", async ({ page }) => {
    await openFile(page, "link-html-demo.md");
    const link = page.locator('.html-inline a[href="nope-html.md"]');
    await expect(link).toBeVisible({ timeout: 10_000 });
    const before = await tabCount(page);

    await ctrlClick(link);

    await expect(page.locator(".md-editor-link-notice")).toContainText("无法打开", {
      timeout: 5_000,
    });
    await expect(page.locator(".md-editor-link-notice")).toContainText("文件不存在");
    expect(await tabCount(page)).toBe(before);
  });

  test("R10 源码 href 保真：不被改写成绝对路径", async ({ page }) => {
    await page.locator('.topbar-btn[title*="源代码模式"]').click();
    const content = page.getByTestId("source-mode-editor").locator(".cm-content");
    await expect(content).toContainText("](readme.md)", { timeout: 5_000 });
    await expect(content).not.toContainText("/mock-workspace/notes/readme.md");
  });
});
