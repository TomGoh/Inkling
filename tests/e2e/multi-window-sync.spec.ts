// E2E：跨窗口 / 多标签页存储同步测试（#133）
// 目标：验证同一存储域内，一个窗口对 localStorage 的修改，会通过浏览器原生
// storage 事件被另一窗口的应用状态监听器捕获并自动应用到 UI。
// 这里取消之前"手动 dispatchEvent + 只查 localStorage 值"的伪断言，
// 改为：窗口 A 写入修改 → 窗口 B 的真实 DOM 状态随之更新（应用真实参与）。

import { test, expect } from "@playwright/test";
import { openMockWorkspace } from "./helpers";

const THEME_KEY = "inkling-theme";

test.describe("跨窗口 / 多页面存储同步 (#133)", () => {
  test("窗口 A 切换主题后，窗口 B 通过 storage 事件自动应用（应用状态联动）", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    // 同一存储域下的两个独立标签页（真正"多窗口"：各自持有独立文档上下文）
    const pageA = await context.newPage();
    const pageB = await context.newPage();

    await openMockWorkspace(pageA);
    await openMockWorkspace(pageB);

    // 确认 window B 已加载应用且主题 store 监听已生效
    const initialTheme = await pageB.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    expect(["light", "dark"]).toContain(initialTheme);

    // 窗口 A 修改主题（与应用 setMode 相同的底层写入路径：直接 setItem 触发原生 storage 事件）
    const targetTheme = initialTheme === "dark" ? "light" : "dark";
    await pageA.evaluate(
      ({ key, value }) => {
        localStorage.setItem(key, value);
      },
      { key: THEME_KEY, value: targetTheme },
    );

    // 窗口 B 通过原生 storage 事件被应用监听并自动应用到 DOM（真实事件 + 应用响应）
    await expect
      .poll(() =>
        pageB.evaluate(() => document.documentElement.getAttribute("data-theme")),
      )
      .toBe(targetTheme);

    await context.close();
  });
});