/**
 * #226 验收（真实浏览器）：
 * ① 自研内置主题出现在「内置」分组、可切换，且注入的是**带 token 覆盖的 @layer theme 产物**；
 * ② `data-theme` 随主题 mode 切换（App.css 基线块 + 主题层覆盖的既有契约不变）；
 * ③ **KaTeX 跟随**：公式颜色随主题变化（§5.2 的裁决 = 跟随，靠 `--content-math`）；
 * ④ 成对变体一键切换（`builtin:tech` ↔ `builtin:tech-dark`）；
 * ⑤ 内置主题不提供「移除/复制为我的主题」（受应用管理）。
 *
 * Mermaid 的跟随（theme 映射 / 缓存 key / 重渲染）由 `tests/components/mermaid-theme.test.ts` 单测覆盖
 * （需要真实图表文档，这里不重复造 fixture）。
 */
import { test, expect, type Page } from "@playwright/test";
import { expandMockNotes, openFile, openMockWorkspace } from "./helpers";

async function ensureEditor(page: Page): Promise<void> {
  if ((await page.getByTitle("主题").count()) === 0) {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
    await expect(page.getByTitle("主题")).toBeVisible({ timeout: 25_000 });
  }
}

async function openThemeMenu(page: Page): Promise<void> {
  await ensureEditor(page);
  await page.getByTitle("主题").click();
  await expect(page.locator('[data-theme-menu="1"]')).toBeVisible();
}

/** 注入产物 + 文档根属性 + 编辑器正文的计算样式（含公式） */
async function probe(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const content = document.querySelector(".editor-scroll .milkdown");
    const katex = document.querySelector(".katex, .math-inline, .math-display");
    const cs = content ? getComputedStyle(content) : null;
    const rootCs = getComputedStyle(root);
    return {
      themeId: root.getAttribute("data-theme-id"),
      mode: root.getAttribute("data-theme"),
      injected: document.getElementById("inkling-theme")?.textContent ?? "",
      contentColor: cs?.color ?? "",
      katexColor: katex ? getComputedStyle(katex).color : null,
      // token 的**解析值**：断言「覆盖真的生效」最稳的口径（不依赖哪个元素消费它）
      editorFontVar: rootCs.getPropertyValue("--editor-font").trim(),
      editorBgVar: rootCs.getPropertyValue("--editor-bg").trim(),
      accentVar: rootCs.getPropertyValue("--accent").trim(),
    };
  });
}

test.describe("#226 自研内置主题与跟随", () => {
  test.describe.configure({ mode: "serial" });

  test("内置分组含自研主题；切到技术（暗）后注入 token 覆盖且模式变为 dark", async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
    await openThemeMenu(page);

    // 四套自研主题都在「内置」分组里（用 id 断言，不依赖文案）
    for (const id of ["builtin:tech", "builtin:tech-dark", "builtin:sepia", "builtin:contrast"]) {
      await expect(page.locator(`[data-theme-option="${id}"]`)).toBeVisible();
    }
    // 内置主题由应用管理：不提供「移除」「复制为我的主题」
    await page.locator('[data-theme-option="builtin:tech-dark"]').click();
    await expect.poll(async () => (await probe(page)).themeId, { timeout: 5000 }).toBe("builtin:tech-dark");

    const s = await probe(page);
    expect(s.mode).toBe("dark");
    // 注入产物 = @layer theme 包裹 + 本主题的 token 覆盖（构建期文本，同步可得）
    expect(s.injected).toContain("@layer theme");
    expect(s.injected).toContain("--editor-bg: #0d141d");
    expect(s.injected).toContain("--accent: #4cc2ff");

    await openThemeMenu(page);
    await expect(page.locator('[data-theme-remove="1"]')).toHaveCount(0);
    await expect(page.locator('[data-theme-duplicate="1"]')).toHaveCount(0);
  });

  test("KaTeX 跟着主题走：同一公式在明/暗下的计算颜色不同（§5.2 裁决=跟随）", async ({ page }) => {
    await openMockWorkspace(page);
    await expandMockNotes(page);
    await openFile(page, "math-demo.md");
    await expect(page.locator(".katex").first()).toBeVisible({ timeout: 10_000 });

    await openThemeMenu(page);
    await page.locator('[data-theme-option="builtin:light"]').click();
    await expect.poll(async () => (await probe(page)).themeId, { timeout: 5000 }).toBe("builtin:light");
    const light = await probe(page);

    await openThemeMenu(page);
    await page.locator('[data-theme-option="builtin:tech-dark"]').click();
    await expect.poll(async () => (await probe(page)).themeId, { timeout: 5000 }).toBe("builtin:tech-dark");
    const dark = await probe(page);

    expect(light.katexColor).toBeTruthy();
    expect(dark.katexColor).toBeTruthy();
    // 公式颜色确实随主题变化（不是「写死黑字」）；正文颜色同理
    expect(dark.katexColor).not.toBe(light.katexColor);
    expect(dark.contentColor).not.toBe(light.contentColor);
  });

  test("暖色阅读主题：纸感底色 + 衬线正文（token 覆盖真的生效）", async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
    await openThemeMenu(page);
    await page.locator('[data-theme-option="builtin:sepia"]').click();
    await expect.poll(async () => (await probe(page)).themeId, { timeout: 5000 }).toBe("builtin:sepia");

    const s = await probe(page);
    expect(s.mode).toBe("light");
    expect(s.injected).toContain("--editor-bg: #fdf6e9");
    // 纸感底色真的生效（token 解析值，非仅文本出现）
    expect(s.editorBgVar).toBe("#fdf6e9");
    // 正文衬线栈生效（`--editor-font` 属基础层，自研主题允许覆盖）
    expect(s.injected).toContain("Georgia");
    expect(s.editorFontVar).toContain("Georgia");
  });

  test("主题层的 token 覆盖真的赢过基线（暗色技术风的强调色解析值）", async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
    await openThemeMenu(page);
    await page.locator('[data-theme-option="builtin:tech-dark"]').click();
    await expect
      .poll(async () => (await probe(page)).themeId, { timeout: 5000 })
      .toBe("builtin:tech-dark");
    await expect.poll(async () => (await probe(page)).accentVar, { timeout: 8000 }).toBe("#4cc2ff");
    expect((await probe(page)).editorBgVar).toBe("#0d141d");
  });

  test("成对变体一键切换（builtin:tech ↔ builtin:tech-dark）", async ({ page }) => {
    await openMockWorkspace(page);
    await openFile(page, "readme.md");
    await openThemeMenu(page);
    await page.locator('[data-theme-option="builtin:tech"]').click();
    await expect.poll(async () => (await probe(page)).themeId, { timeout: 5000 }).toBe("builtin:tech");

    await openThemeMenu(page);
    const variant = page.locator('[data-theme-variant="1"]');
    await expect(variant).toBeVisible();
    await expect(variant).toContainText("深色");
    await variant.click();
    await expect
      .poll(async () => (await probe(page)).themeId, { timeout: 5000 })
      .toBe("builtin:tech-dark");
    expect((await probe(page)).mode).toBe("dark");
  });
});
