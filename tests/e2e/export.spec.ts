// E2E：导出功能
// 覆盖：导出菜单、复制 Markdown、导出 HTML/大纲/PNG 下载、Word 降级 alert、
//       跨源背景图进导出画布（#348 守卫）

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { test, expect, type Page } from "@playwright/test";
import { openMockWorkspace, openFile } from "./helpers";

/**
 * #348 守卫：**跨源**背景图必须真的进导出长图。
 *
 * 背景：主题里的 `url(<本地图>)` 会被 `#306` 改写成跨源绝对 URL，而 PNG 导出走
 * `html2canvas(themeRoot, { useCORS: true })`（`src/lib/exporter.ts:299-304`，**未开** `allowTaint`）。
 * 跨源图若拿不到 `Access-Control-Allow-Origin`，html2canvas 会**静默跳过**（不报错、图消失）——
 * 这是「应用里正常、导出里丢图」的典型形态。真机（asset 协议）那侧由
 * `scripts/probe-asset-bg-export.mjs` 实测（判定通过），本用例把「跨源 + ACAO ⇒ 必须画上」
 * 这条不变量钉在 CI 里。
 *
 * 手段：往 `<head>` 注入一条作用于 `.editor-scroll .milkdown p` 的背景图规则
 * （离屏导出容器复用同一个文档，后代选择器天然命中，与主题同形态），导出后
 * **扫全图找探针图的纯绿色像素**（不依赖版面坐标，避免布局差异带来的脆弱断言）。
 */
const GREEN_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEElEQVR4nGNg+M+AHQ0tCQDpMD/B9YBzjgAAAABJRU5ErkJggg==",
  "base64",
);

/** 触发「导出长图」并数出产物里的纯绿像素数；导出失败/没拿到文件时返回 null */
async function exportAndCountGreenPixels(
  page: Page,
  timeout = 30_000,
): Promise<number | null> {
  // 菜单可能已是「展开」态（同一用例内连续导出两次时）：只按需展开，避免点成关闭
  if (!(await page.locator(".export-dropdown").isVisible().catch(() => false))) {
    await page.locator('.topbar-btn[title="导出"]').click();
  }
  await expect(page.locator(".export-dropdown")).toBeVisible({ timeout: 5_000 });
  const downloadPromise = page.waitForEvent("download", { timeout }).catch(() => null);
  await page.locator(".export-item", { hasText: "导出长图" }).click();
  const download = await downloadPromise;
  const file = download ? await download.path() : null;
  if (!file) return null;
  const dataUrl = `data:image/png;base64,${readFileSync(file).toString("base64")}`;
  return page.evaluate(async (url) => {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("导出产物不是可解码的 PNG"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] < 60 && d[i + 1] > 200 && d[i + 2] < 60) n += 1;
    }
    return n;
  }, dataUrl);
}

test.describe("导出功能", () => {
  test.beforeEach(async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
  });

  test("E1 点击导出展开菜单", async ({ page }) => {
    await page.locator('.topbar-btn[title="导出"]').click();
    await expect(page.locator(".export-dropdown")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".export-item", { hasText: "复制为 Markdown" })).toBeVisible();
    await expect(page.locator(".export-item", { hasText: "导出 HTML" })).toBeVisible();
    await expect(page.locator(".export-item", { hasText: "导出 Word" })).toBeVisible();
    await expect(page.locator(".export-item", { hasText: "导出长图" })).toBeVisible();
  });

  test("E2 复制为 Markdown 写入剪贴板", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.locator('.topbar-btn[title="导出"]').click();
    await page.locator(".export-item", { hasText: "复制为 Markdown" }).click();
    await page.waitForTimeout(300);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain("Readme");
  });

  test("E3 导出 HTML 触发下载", async ({ page }) => {
    const downloadPromise = page.waitForEvent("download", { timeout: 10_000 });
    await page.locator('.topbar-btn[title="导出"]').click();
    await page.locator(".export-item", { hasText: "导出 HTML" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/readme\.html$/);
  });

  test("E4 导出大纲触发下载", async ({ page }) => {
    const downloadPromise = page.waitForEvent("download", { timeout: 10_000 });
    await page.locator('.topbar-btn[title="导出"]').click();
    await page.locator(".export-item", { hasText: "导出大纲" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/readme-outline\.md$/);
  });

  test("E5 导出长图 PNG 触发下载", async ({ page }) => {
    const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
    await page.locator('.topbar-btn[title="导出"]').click();
    await page.locator(".export-item", { hasText: "导出长图" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/readme\.png$/);
  });

  test("E7 跨源背景图必须进导出长图（带 ACAO 画上 / 缺 ACAO 不画上，#348 守卫）", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const origin = new URL(page.url()).origin;
    // 与页面**跨源**的图片服务（不同 host），按路径决定是否回 ACAO
    const server = createServer((req, res) => {
      const headers: Record<string, string> = {
        "content-type": "image/png",
        "cache-control": "no-store",
      };
      // /no-cors.png 故意不回 ACAO ⇒ 浏览器按 CORS 拒绝，用作「断言有分辨力」的对照
      if (!req.url?.includes("no-cors")) headers["access-control-allow-origin"] = origin;
      res.writeHead(200, headers).end(GREEN_PNG);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    try {
      await page.addStyleTag({
        content:
          ".editor-scroll .milkdown p{" +
          `background-image:url("http://127.0.0.1:${port}/ok.png");` +
          "background-repeat:no-repeat;background-size:40px 40px;}",
      });
      expect((await exportAndCountGreenPixels(page)) ?? -1).toBeGreaterThan(500);

      await page.addStyleTag({
        content:
          ".editor-scroll .milkdown p{" +
          `background-image:url("http://127.0.0.1:${port}/no-cors.png");}`,
      });
      // 缺 ACAO ⇒ 跨源图进不了画布（要么静默丢图、要么整轮导出直接失败），两种都不算「画上了」
      expect((await exportAndCountGreenPixels(page, 12_000)) ?? 0).toBeLessThan(50);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test("E6 导出 Word 浏览器端降级 alert", async ({ page }) => {
    // 先打开导出下拉菜单
    await page.locator('.topbar-btn[title="导出"]').click();
    await expect(page.locator(".export-dropdown")).toBeVisible({ timeout: 5_000 });
    // alert() 是同步阻塞的：必须在点击前注册 dialog 处理器自动 accept，
    // 否则 alert 会卡住页面导致 click() 永远不返回（waitForEvent 不会自动 dismiss）
    let dialogMessage = "";
    page.once("dialog", (d) => {
      dialogMessage = d.message();
      void d.accept();
    });
    await page.locator(".export-item", { hasText: "导出 Word" }).click();
    // alert 被 page.once 自动 accept 后页面恢复，轮询拿到的消息
    await expect
      .poll(() => dialogMessage, { timeout: 10_000 })
      .toContain("Word 导出仅在桌面端可用");
  });
});
