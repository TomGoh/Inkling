// 混排文档（密度不均匀）模式切换的内容锚点回归测试（#136）
// 缺陷根因：两容器密度分布不均（代码块/标题/段落在富文本与源码里的
// 高度占比差异巨大），按滚动比例映射保住百分比却落到不同内容上。
// 修复：双向都以「视口顶部内容」为锚点映射。本测试断言：
// 1) 进入源码模式后，CM 视口顶部与切换前 PM 视口顶部是同一节内容；
// 2) 往返切换后，PM 视口顶部仍停留在同一节，不漂到文档其他位置。

import { test, expect, type Page } from "@playwright/test";
import { openMockWorkspace, openFile, MOD } from "./helpers";

// 混排文档：交替「代码重节」（CM 里行多、PM 里一个代码块）与
// 「文本重节」（PM 里段落占高大、CM 里行少）——密度分布严重不均匀
function buildMixedDoc(): string {
  const parts: string[] = ["# 混排测试文档"];
  for (let i = 1; i <= 30; i++) {
    if (i % 2 === 0) {
      // 代码重节：60 行代码（CM 高占比大，PM 一个 code_block）
      parts.push(`## 代码节 ${i}`);
      parts.push("```js");
      for (let j = 0; j < 60; j++) {
        parts.push(`const v${j} = compute(${i}, ${j}); // 填充行 ${j}`);
      }
      parts.push("```");
    } else {
      // 文本重节：多段落（PM 占高大：标题+段间距，CM 仅几行）
      parts.push(`## 文本节 ${i}`);
      for (let k = 0; k < 4; k++) {
        parts.push(
          `这是文本节 ${i} 的第 ${k + 1} 段。为了撑起富文本里的段落高度与段间距，这里写一段足够长的中文内容，用来制造两种渲染模式之间的密度差异。`,
        );
      }
    }
  }
  return parts.join("\n");
}

const MIXED = buildMixedDoc();

/** 从视口顶部内容文本提取节号（「文本节 15」/「代码节 8」/「compute(8, ...)」） */
function sectionOf(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.match(/节 (\d+)/) ?? text.match(/compute\((\d+)/);
  return m ? Number(m[1]) : null;
}

/** PM 视口顶部第一个可见块（标签+文本摘要） */
async function pmTopBlock(page: Page) {
  return page.evaluate(() => {
    const scroller = document.querySelector(".editor-scroll");
    const pm = document.querySelector(".ProseMirror");
    if (!scroller || !pm) return null;
    const top = scroller.getBoundingClientRect().top;
    for (const el of Array.from(pm.children)) {
      const r = el.getBoundingClientRect();
      if (r.bottom > top + 4) {
        return {
          tag: el.tagName.toLowerCase(),
          // 代码块 nodeview 的 textContent 开头是语言选择器按钮文本
          // （textjavascripttypescript...），取长一点才能覆盖到真实代码行
          text: (el.textContent ?? "").slice(0, 400),
        };
      }
    }
    return null;
  });
}

/** CM 视口顶部第一个真正可见的行文本（跳过被滚出视口的行） */
async function cmTopLine(page: Page) {
  return page.evaluate(() => {
    const scroller = document.querySelector(".source-mode-editor .cm-scroller");
    if (!scroller) return null;
    const top = scroller.getBoundingClientRect().top;
    for (const el of Array.from(
      document.querySelectorAll(".source-mode-editor .cm-line"),
    )) {
      const r = el.getBoundingClientRect();
      if (r.top >= top - 1 && r.bottom > top + 4) {
        return (el.textContent ?? "").slice(0, 40);
      }
    }
    return null;
  });
}

test("混排文档模式切换以视口顶部内容为锚，往返不漂移（#136）", async ({ page }) => {
  test.setTimeout(90_000);
  await openMockWorkspace(page);
  await openFile(page, "readme.md");

  // 灌入混排文档
  await page.keyboard.press(`${MOD}+Alt+KeyS`);
  const cm = page.getByTestId("source-mode-editor").locator(".cm-content");
  await expect(cm).toBeVisible({ timeout: 5_000 });
  await cm.click();
  await page.keyboard.press(`${MOD}+KeyA`);
  await page.keyboard.insertText(MIXED);
  await page.keyboard.press(`${MOD}+Alt+KeyS`);
  await expect(page.locator(".ProseMirror")).toContainText("文本节 29", {
    timeout: 10_000,
  });
  await page.waitForTimeout(800);

  for (const p of [0.25, 0.5, 0.75]) {
    // WYSIWYG 滚到进度 p
    await page.evaluate((prog) => {
      const el = document.querySelector(".editor-scroll");
      if (el) el.scrollTop = (el.scrollHeight - el.clientHeight) * prog;
    }, p);
    await page.waitForTimeout(800);

    const pmBefore = await pmTopBlock(page);
    const sectionBefore = sectionOf(pmBefore?.text);
    expect(
      sectionBefore,
      `进度 ${p}: PM 顶部块应能提取节号，实际 "${pmBefore?.text}"`,
    ).not.toBeNull();

    // 进入源码模式：CM 视口顶部必须是同一节内容（内容锚点映射）
    await page.keyboard.press(`${MOD}+Alt+KeyS`);
    await expect(
      page.getByTestId("source-mode-editor").locator(".cm-content"),
    ).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(1_200);

    const cmTop = await cmTopLine(page);
    expect(
      sectionOf(cmTop),
      `进度 ${p}: 进入后 CM 顶部 "${cmTop}" 应与 PM 顶部 "${pmBefore?.text}" 同节`,
    ).toBe(sectionBefore);

    // 退出源码模式（往返）：PM 视口顶部仍停留同一节，不漂走
    await page.keyboard.press(`${MOD}+Alt+KeyS`);
    await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(1_200);

    const pmAfter = await pmTopBlock(page);
    expect(
      sectionOf(pmAfter?.text),
      `进度 ${p}: 往返后 PM 顶部 "${pmAfter?.text}" 应与切换前 "${pmBefore?.text}" 同节`,
    ).toBe(sectionBefore);
  }
});
