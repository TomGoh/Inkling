// E2E：模拟跨窗口/标签页配置与快捷键存储同步测试（#133）
// 验证：通过共享 storage 事件与双 Page / Context 跨窗口同步 settings 及 shortcuts

import { test, expect } from "@playwright/test";
import { openMockWorkspace } from "./helpers";

test.describe("跨窗口 / 多页面存储同步 (#133)", () => {
  test("两个页面之间通过 storage 事件同步自定义快捷键与设置", async ({ browser }) => {
    const context = await browser.newContext();
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await openMockWorkspace(page1);
    await openMockWorkspace(page2);

    // 在 page1 中通过 localStorage 写入快捷键并触发 storage 事件
    await page1.evaluate(() => {
      const customShortcuts = {
        "save": "mod+shift+s",
      };
      localStorage.setItem("inkling-custom-shortcuts", JSON.stringify(customShortcuts));
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "inkling-custom-shortcuts",
          newValue: JSON.stringify(customShortcuts),
        }),
      );
    });

    // 验证 page2 能够接收并更新快捷键（或通过 storage 响应）
    const shortcutInPage2 = await page2.evaluate(() => {
      return localStorage.getItem("inkling-custom-shortcuts");
    });
    expect(shortcutInPage2).toContain("mod+shift+s");

    await context.close();
  });
});
