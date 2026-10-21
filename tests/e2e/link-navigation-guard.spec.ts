// E2E：链接导航守卫（#298）
//
// 这一组用例的杀伤力来自 **html-view 的 contenteditable=false 子树**：
// link mark 上的 `<a>` 会被 Chromium 抑制激活（PR #354 变异 C 实测），
// 只有 html 块里的真实 `<a>` 才会在「不 preventDefault」时真的发生导航。
//
// 因此每条用例都断言**两件事**：
// 1) `framenavigated` 事件一次都没有（同文档 hash 跳转也会触发，比只看 page.url() 更严）；
// 2) URL 与 hash 未变。
//
// fixture 自 #360 起含相对 href（render 模式仅 `<a href>` 保留），但 H1/H2/H8 只针对
// 绝对 URL / 根路径 / 空 href；相对链接的打开与提示由 link-relative-path.spec.ts 覆盖。

import { test, expect, type Page } from "@playwright/test";
import { openMockWorkspace, openFile, MOD } from "./helpers";

const CLICK_MODIFIER = MOD === "Meta" ? "Meta" : "Control";
const HTML_DEMO_FILE = "link-html-demo.md";
const FILE_DEMO_FILE = "link-file-demo.md";

/** 监听主 frame 的每一次导航（含同文档 hash 跳转） */
function trackNavigations(page: Page): string[] {
  const navigations: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });
  return navigations;
}

/** 拦截 window.open，记录被打开的 URL */
async function stubWindowOpen(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __openedUrls: string[] };
    w.__openedUrls = [];
    window.open = (url?: string | URL) => {
      w.__openedUrls.push(String(url));
      return null;
    };
  });
}

async function openedUrls(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __openedUrls: string[] }).__openedUrls);
}

/** 等待默认行为有机会发生，再断言「一次导航都没有」 */
async function expectNoNavigation(page: Page, navigations: string[], urlBefore: string) {
  await page.waitForTimeout(400);
  expect(navigations).toEqual([]);
  expect(page.url()).toBe(urlBefore);
  expect(await page.evaluate(() => window.location.hash)).toBe("");
}

test.describe("链接导航守卫", () => {
  test.beforeEach(async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, HTML_DEMO_FILE);
  });

  test("H1 html 外链裸点击：不导航、不改 hash、不开新窗口", async ({ page }) => {
    const link = page.locator('.html-inline a[href="https://example.com"]');
    await expect(link).toBeVisible({ timeout: 10_000 });
    await expect(link).toHaveAttribute("href", "https://example.com");

    await stubWindowOpen(page);
    const navigations = trackNavigations(page);
    const urlBefore = page.url();

    await link.click();

    await expectNoNavigation(page, navigations, urlBefore);
    expect(await openedUrls(page)).toEqual([]);
  });

  test("H2 html 根路径链接裸点击：不导航", async ({ page }) => {
    const link = page.locator('.html-inline a[href="/readme.md"]');
    await expect(link).toBeVisible({ timeout: 10_000 });
    await expect(link).toHaveAttribute("href", "/readme.md");

    const navigations = trackNavigations(page);
    const urlBefore = page.url();

    await link.click();

    await expectNoNavigation(page, navigations, urlBefore);
  });

  test("H3 html 锚点链接裸点击：不改 hash", async ({ page }) => {
    const link = page.locator('.html-inline a[href="#重复标题-1"]');
    await expect(link).toBeVisible({ timeout: 10_000 });
    await expect(link).toHaveAttribute("href", "#重复标题-1");

    const navigations = trackNavigations(page);
    const urlBefore = page.url();

    await link.click();

    await expectNoNavigation(page, navigations, urlBefore);
  });

  test("H4 中键点击 html 外链：不新开页、不导航", async ({ page, context }) => {
    const link = page.locator('.html-inline a[href="https://example.com"]');
    await expect(link).toBeVisible({ timeout: 10_000 });

    // 中键的默认后果是「在新页打开」：它既不改变当前 page.url()，也不触发当前 frame 的
    // framenavigated。只断言这两项对 auxclick 分支等于零覆盖，必须直接盯 context 的页数。
    const openedPages: Page[] = [];
    context.on("page", (p) => openedPages.push(p));

    await stubWindowOpen(page);
    const navigations = trackNavigations(page);
    const urlBefore = page.url();

    await link.click({ button: "middle" });
    // 新页由浏览器异步创建，留一个明确的观察窗口
    await page.waitForTimeout(600);

    expect(openedPages).toHaveLength(0);
    expect(context.pages()).toHaveLength(1);
    await expectNoNavigation(page, navigations, urlBefore);
    expect(await openedUrls(page)).toEqual([]);
  });

  test("H5 file:// 链接：裸点击不导航，Ctrl+点击给出「不支持 file://」提示", async ({ page }) => {
    await openFile(page, FILE_DEMO_FILE);

    const fileLink = page.locator(".ProseMirror a", { hasText: "本地文件" });
    await expect(fileLink).toHaveCount(1);
    // 上游 sanitizeLinkHref 把 file: 的 DOM href 抹成空串——这正是 F5 的回落场景
    await expect(fileLink).toHaveAttribute("href", "");

    const navigations = trackNavigations(page);
    const urlBefore = page.url();

    // 说明（评审阻塞项 2）：这半条在浏览器端是**端状态记录**，不是防线——
    // 该 <a> 是 contenteditable 内的 link mark，Chromium 会抑制其激活（PR #354 变异 C 实测），
    // 即使 capture 层不 preventDefault 也不会产生导航。真正有杀伤力的是下面 Ctrl+点击的
    // 提示断言（验证 DOM href 为空时回落到 mark 的 attrs.href）；桌面端 WebView2 的实际
    // 行为归 PR「证据边界」的人工核对清单。
    await fileLink.click();
    await expectNoNavigation(page, navigations, urlBefore);

    await fileLink.click({ modifiers: [CLICK_MODIFIER] });
    await expect(page.locator(".md-editor-link-notice")).toHaveText("不支持 file:// 链接");
  });

  test("H6 Ctrl+点击 html 外链：交给系统浏览器恰一次，自身不导航", async ({ page }) => {
    const link = page.locator('.html-inline a[href="https://example.com"]');
    await expect(link).toBeVisible({ timeout: 10_000 });

    await stubWindowOpen(page);
    const navigations = trackNavigations(page);
    const urlBefore = page.url();

    await link.click({ modifiers: [CLICK_MODIFIER] });

    await expectNoNavigation(page, navigations, urlBefore);
    expect(await openedUrls(page)).toEqual(["https://example.com"]);
  });

  test("H7 裸点击 link mark 后仍可继续输入（preventDefault 不冻结编辑器）", async ({ page }) => {
    await openFile(page, "link-demo.md");
    const link = page.locator('.ProseMirror a[href="https://example.com"]');
    await expect(link).toBeVisible({ timeout: 10_000 });

    const navigations = trackNavigations(page);
    const urlBefore = page.url();

    await link.click();
    await page.keyboard.type("回归");

    await expect(page.locator(".ProseMirror")).toContainText("回归");
    await expectNoNavigation(page, navigations, urlBefore);
  });

  test("H8 html 空 href 链接裸点击：绝不回落到当前 URL 导航", async ({ page }) => {
    const link = page.locator('.html-inline a[href=""]');
    await expect(link).toHaveCount(1);
    await expect(link).toHaveText("HTML 空链接");

    const navigations = trackNavigations(page);
    const urlBefore = page.url();

    await link.click();

    // 设计 §3 末行：DOM href 与 mark href 都为空时必须「无动作」，绝不回落到当前 URL。
    // 该 <a> 位于 html 块（contenteditable=false），浏览器默认行为是整页重载 ——
    // 删掉 capture 层 preventDefault 后这条会转红（见 PR 的变异记录）。
    await expectNoNavigation(page, navigations, urlBefore);
  });
});
