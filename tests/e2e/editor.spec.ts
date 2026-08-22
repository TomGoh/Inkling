// E2E：编辑器核心流程
// 浏览器版本（isTauri() === false）需先点击「打开文件夹」按钮加载 mock 工作区
// 覆盖：应用启动、打开 mock 文件、编辑器渲染、输入内容、状态栏统计

import { test, expect } from "@playwright/test";
import {
  expandMockNotes,
  openFile,
  openMockWorkspace,
  moveCaretToDocEnd,
  MOD,
} from "./helpers";

test.describe("编辑器核心流程", () => {
  test("应用启动后显示侧边栏与打开按钮", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".sidebar")).toBeVisible();
    // 空状态提示
    await expect(page.locator(".empty-state").getByText(/打开文件夹/)).toBeVisible();
    // 打开文件夹按钮存在
    await expect(page.locator(".sidebar-header").getByRole("button", { name: "打开文件夹" })).toBeVisible();
  });

  test("点击「打开文件夹」加载 mock 工作区", async ({ page }) => {
    await openMockWorkspace(page);
    // 子目录默认折叠，展开后才加载其中的文件
    await expect(page.locator(".sidebar-tree").getByText("intro.md")).toBeVisible();
    await expect(page.locator(".sidebar-tree").getByText("readme.md")).toHaveCount(0);
    await expandMockNotes(page);
    await expect(page.locator(".sidebar-tree").getByText("readme.md")).toBeVisible();
    await expect(page.locator(".sidebar-tree").getByText("todo.md")).toBeVisible();
  });

  test("点击 mock 文件打开编辑器", async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
    // 标签页显示文件名
    await expect(page.locator(".tab-active")).toContainText("readme.md");
  });

  test("从侧边栏打开文件时保留文件树实例与滚动位置", async ({ page }) => {
    await openMockWorkspace(page);
    await expandMockNotes(page);
    await page.addStyleTag({
      content: ".workspace-tree-scroll { flex: none !important; height: 56px !important; }",
    });

    const tree = page.locator(".workspace-tree-scroll");
    const expectedScrollTop = await tree.evaluate((element) => {
      const scroll = element as HTMLElement;
      scroll.dataset.issue12Sentinel = "preserved";
      scroll.scrollTop = 28;
      scroll.dispatchEvent(new Event("scroll", { bubbles: true }));
      return scroll.scrollTop;
    });
    expect(expectedScrollTop).toBe(28);

    await page
      .locator('[data-tree-row][data-path="/mock-workspace/notes/readme.md"]')
      .click();
    await expect(page.locator(".tab-active")).toContainText("readme.md");

    await expect(tree).toHaveAttribute("data-issue12-sentinel", "preserved");
    expect(await tree.evaluate((element) => (element as HTMLElement).scrollTop)).toBe(
      expectedScrollTop,
    );
    await expect(
      page.locator('[data-tree-row][data-path="/mock-workspace/notes"]'),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".sidebar-tree").getByText("加载中…")).toHaveCount(0);
  });

  test("编辑器渲染 mock 文件内容", async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
    // mock readme.md 内容含 "Readme" 标题
    await expect(page.locator(".ProseMirror h1")).toContainText("Readme");
  });

  test("输入内容后状态栏字数更新", async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
    const initial = await page.locator(".status-bar").textContent();
    // 在编辑器末尾输入（平台自适应按键，mac 无 Ctrl+End 语义，issue #36）
    await page.locator(".ProseMirror").click();
    await moveCaretToDocEnd(page);
    await page.keyboard.type("测试输入新内容");
    await expect(page.locator(".status-bar")).not.toHaveText(initial ?? "", { timeout: 5_000 });
  });

  test("状态栏显示字数/字符/行数", async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
    const text = (await page.locator(".status-bar").textContent()) ?? "";
    expect(text).toContain("字数");
    expect(text).toContain("字符");
    expect(text).toContain("行");
    expect(text).toContain("阅读");
  });
});

test.describe("多标签页", () => {
  test("打开多个文件显示多个 tab", async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
    await openFile(page, "todo.md");
    await openFile(page, "intro.md");
    await expect(page.locator(".tab")).toHaveCount(3);
  });

  test("点击 tab 切换文件", async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
    await openFile(page, "todo.md");
    await expect(page.locator(".tab-active")).toContainText("todo.md");
    // 点击 readme.md tab 切换回去
    await page.locator(".tab", { hasText: "readme.md" }).click();
    await expect(page.locator(".tab-active")).toContainText("readme.md");
  });

  test("关闭 tab", async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
    await openFile(page, "todo.md");
    await expect(page.locator(".tab")).toHaveCount(2);
    await page.locator(".tab-active .tab-close").click();
    await expect(page.locator(".tab")).toHaveCount(1);
  });

  test("防抖窗口内中键关闭 tab 弹未保存确认，不静默丢弃", async ({ page }) => {
    // 回归：dirty 异步标记时，窗口内中键关闭跳过确认并静默丢弃编辑
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
    await page.locator(".ProseMirror").click();
    await page.keyboard.type("中键不丢");
    let dialogMsg = "";
    page.once("dialog", (d) => {
      dialogMsg = d.message();
      void d.dismiss();
    });
    await page.locator(".tab-active").click({ button: "middle" });
    await expect.poll(() => dialogMsg, { timeout: 5_000 }).toContain("未保存");
    // 取消后 tab 与内容仍在
    await expect(page.locator(".tab")).toHaveCount(1);
    await expect(page.locator(".ProseMirror")).toContainText("中键不丢");
  });

  test("输入后立即手动保存，防抖窗口内的输入一并落盘", async ({ page }) => {
    // 回归：保存路径未 flush publisher 时，Ctrl/Cmd+S 读到旧内容，
    // 首次编辑 dirty 仍为 false 直接跳过保存，最近输入延迟落盘甚至丢失
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
    await page.locator(".ProseMirror").click();
    await page.keyboard.type("保存不丢字");
    await page.keyboard.press(`${MOD}+KeyS`);
    await expect(page.getByText(/已保存/)).toBeVisible({ timeout: 5_000 });
    // 防抖窗口过后不应出现「未保存」（修复前 publisher 迟到标记 dirty）
    await page.waitForTimeout(600);
    await expect(page.getByText("未保存")).toHaveCount(0);
    await expect(page.locator(".ProseMirror")).toContainText("保存不丢字");
  });

  test("输入后立即新建 tab，防抖窗口内内容落回原 tab 不串写", async ({ page }) => {
    // 回归：异步发布绑定文件路径前，销毁期 flush 会把旧编辑器内容写进新 active tab
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
    await page.locator(".ProseMirror").click();
    await page.keyboard.type("跨tab不串内容");
    // 不等防抖、不经过 blur，直接新建 tab
    await page.keyboard.press(`${MOD}+n`);
    await expect(page.locator(".tab-active")).toContainText("未命名", {
      timeout: 5_000,
    });
    await expect(page.locator(".ProseMirror")).not.toContainText("跨tab不串内容");
    // 切回原 tab，内容正确落回
    await page.locator(".tab", { hasText: "readme.md" }).click();
    await expect(page.locator(".ProseMirror")).toContainText("跨tab不串内容", {
      timeout: 5_000,
    });
  });
});
