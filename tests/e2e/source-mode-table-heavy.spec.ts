// 表格/标记密集真实文档的模式切换锚点回归（#136）
// 用例文档直接取 tests/fixtures/ 的 UI-UX-REVIEW.md（用户实测报告缺陷的文档，评审 N4 迁移入 fixtures）：
// 大量管道表格、重复短单元格（低/中/7.0）、粗体标签列表、CSS 围栏代码。
// 旧实现缺陷：进入方向按整段 textBefore 子串/lastIndexOf 匹配，
// 标记剥离不一致 + 短单元格命中末次出现 → 视口在第 4/6 节切源码跳到文末、
// 第 5 节落到第 4 节。断言：以标题置顶切换后，CM 顶部必须落在同节内。

import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openMockWorkspace, openFile, MOD, waitScrollConverged } from "./helpers";

const SPEC_DIR = dirname(fileURLToPath(import.meta.url));
const DOC = readFileSync(join(SPEC_DIR, "../../tests/fixtures/UI-UX-REVIEW.md"), "utf-8");
const LINES = DOC.split("\n");

function headingLine(prefix: string): number {
  const idx = LINES.findIndex((l) => l.trim().startsWith(prefix));
  if (idx < 0) throw new Error(`找不到标题行: ${prefix}`);
  return idx;
}

// 章节范围：[本节标题行, 下一节标题行)
const SECTIONS: { name: string; from: number; to: number }[] = [
  {
    name: "4",
    from: headingLine("## 4. Recommended Design Direction"),
    to: headingLine("## 5. Design System Proposal"),
  },
  {
    name: "5",
    from: headingLine("## 5. Design System Proposal"),
    to: headingLine("## 6. Component-level Recommendations"),
  },
  {
    name: "6",
    from: headingLine("## 6. Component-level Recommendations"),
    to: headingLine("## 7. Editor-specific Recommendations"),
  },
];

/** WYSIWYG 里把指定文本的标题滚到滚动容器视口顶部 */
async function scrollHeadingToTop(page: Page, text: string) {
  // 慢环境（Windows CI）上 Milkdown 解析/挂载存在异步窗口，标题可能尚未入 DOM。
  // 先轮询等待标题元素出现再滚动，避免 evaluate 一次性执行时找不到标题而失败。
  await page.waitForFunction(
    (t) => {
      const pm = document.querySelector(".ProseMirror");
      return (
        !!pm &&
        Array.from(pm.querySelectorAll("h1,h2,h3,h4")).some((h) =>
          (h.textContent ?? "").includes(t),
        )
      );
    },
    text,
    { timeout: 30_000 },
  );
  // 退出源码模式会异步恢复滚动位置（rAF），可能与这里紧邻的下一次
  // scrollIntoView 竞态，把滚动拽回上一个章节、导致进入源码时视口顶部并非目标
  // 标题（#136 回归 flaky 的根因：test-results 显示 scrollIntoView 后 gap=0.37 已到位，
  // 但 waitScrollConverged 窗口内 scrollTop 又被 remount 恢复拉回上一节）。因此
  // 不寄望「一次 scrollIntoView 一定到位」：循环「滚动 → 等收敛 → 校验标题贴顶」，
  // 未能稳定贴顶则重滚，直到滚动真正固定在目标标题顶部再返回。
  const headingGap = (t: string): Promise<number> =>
    page.evaluate((headingText) => {
      const scroller = document.querySelector(".editor-scroll");
      const pm = document.querySelector(".ProseMirror");
      if (!scroller || !pm) return Infinity;
      const el = Array.from(pm.querySelectorAll("h1,h2,h3,h4")).find((h) =>
        (h.textContent ?? "").includes(headingText),
      );
      if (!el) return Infinity;
      const r = el.getBoundingClientRect();
      const s = scroller.getBoundingClientRect();
      return r.top - s.top;
    }, t);
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.evaluate((t) => {
      const pm = document.querySelector(".ProseMirror");
      if (!pm) throw new Error("编辑器未就绪");
      const el = Array.from(pm.querySelectorAll("h1,h2,h3,h4")).find((h) =>
        (h.textContent ?? "").includes(t),
      );
      if (!el) throw new Error(`未找到标题 ${t}`);
      el.scrollIntoView({ block: "start" });
    }, text);
    // 等滚动收敛稳定后再校验（替代固定 600ms sleep，评审 N6）
    await waitScrollConverged(page, ".editor-scroll");
    const gap = await headingGap(text);
    // 标题顶应与滚动容器顶贴合（允许少量舍入/亚像素误差）
    if (gap >= -2 && gap <= 8) return;
    if (attempt === 4) {
      throw new Error(
        `标题未能稳定滚动到视口顶部: ${text}（gap=${gap}px，重试 5 次）`,
      );
    }
  }
}

/** CM 视口顶部前 n 条可见行文本 */
async function cmTopLines(page: Page, n = 3): Promise<string[]> {
  return page.evaluate((count) => {
    const scroller = document.querySelector(".source-mode-editor .cm-scroller");
    if (!scroller) return [];
    const top = scroller.getBoundingClientRect().top;
    const out: string[] = [];
    for (const el of Array.from(
      document.querySelectorAll(".source-mode-editor .cm-line"),
    )) {
      const r = el.getBoundingClientRect();
      if (r.bottom > top + 4) {
        out.push(el.textContent ?? "");
        if (out.length >= count) break;
      }
    }
    return out;
  }, n);
}

/** 用可见行序列在原文里定位行号（连续 3 行在此文档中唯一） */
function locateLines(topLines: string[]): number {
  expect(topLines.length).toBeGreaterThanOrEqual(2);
  for (let i = 0; i < LINES.length; i++) {
    let ok = true;
    for (let k = 0; k < topLines.length; k++) {
      const doc = (LINES[i + k] ?? "").trim();
      const vis = (topLines[k] ?? "").trim();
      if (doc !== vis) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

test("表格/标记密集真实文档：富文本→源码锚定同节，往返不漂移（#136）", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openMockWorkspace(page);
  await openFile(page, "readme.md");

  // 灌入真实文档（源码模式整篇替换）
  await page.keyboard.press(`${MOD}+Alt+KeyS`);
  const cm = page.getByTestId("source-mode-editor").locator(".cm-content");
  await expect(cm).toBeVisible({ timeout: 5_000 });
  await cm.click();
  await page.keyboard.press(`${MOD}+KeyA`);
  await page.keyboard.insertText(DOC);
  await page.keyboard.press(`${MOD}+Alt+KeyS`);
  await expect(page.locator(".ProseMirror")).toContainText(
    "Component-level Recommendations",
    { timeout: 30_000 },
  );
  // 等 WYSIWYG 布局收敛（替代固定 800ms sleep，评审 N6）
  await waitScrollConverged(page, ".editor-scroll");

  for (const sec of SECTIONS) {
    // Windows CI（core.autocrlf=true）checkout 后文档为 CRLF，行尾带 \r；
    // 剥标题前缀后必须再 trim，否则 includes("...\r") 在 DOM 纯文本上永远不命中。
    const headingText = LINES[sec.from].replace(/^#+\s*/, "").trim();
    await scrollHeadingToTop(page, headingText);

    // 进入源码模式：顶部可见行必须落在同一章节范围内
    // （允许锚在标题上一行的舍入容差，不允许跨节/跳文末）
    await page.keyboard.press(`${MOD}+Alt+KeyS`);
    await expect(
      page.getByTestId("source-mode-editor").locator(".cm-content"),
    ).toBeVisible({ timeout: 5_000 });
    // 等 CM settle 收敛稳定后再读顶部行（替代固定 1.5s sleep，评审 N6）
    await waitScrollConverged(
      page,
      ".source-mode-editor .cm-scroller",
      15_000,
    );

    const topLines = await cmTopLines(page);
    const idx = locateLines(topLines);
    expect(
      idx,
      `第 ${sec.name} 节：CM 顶部行应能定位，实际 "${topLines.join(" | ")}"`,
    ).toBeGreaterThanOrEqual(0);
    expect(
      idx,
      `第 ${sec.name} 节：CM 顶部行 ${idx}（"${topLines[0]}"）应在 [${sec.from}, ${sec.to}) 内，不允许漂移`,
    ).toBeGreaterThanOrEqual(sec.from - 2);
    expect(idx).toBeLessThan(sec.to);

    // 往返：退回富文本后，该节标题应仍在视口内（不能跳到文末/文首）。
    await page.keyboard.press(`${MOD}+Alt+KeyS`);
    await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 5_000 });
    // 轮询等待：退回后 Milkdown 重挂载有异步窗口，标题可能延迟入 DOM/布局。
    await expect
      .poll(
        () =>
          page.evaluate((t) => {
            const scroller = document.querySelector(".editor-scroll");
            const pm = document.querySelector(".ProseMirror");
            if (!scroller || !pm) return false;
            const el = Array.from(pm.querySelectorAll("h1,h2,h3,h4")).find((h) =>
              (h.textContent ?? "").includes(t),
            );
            if (!el) return false;
            const r = el.getBoundingClientRect();
            const s = scroller.getBoundingClientRect();
            return r.top >= s.top - 150 && r.top < s.bottom;
          }, headingText),
        { timeout: 15_000 },
      )
      .toBe(true);
  }
});
