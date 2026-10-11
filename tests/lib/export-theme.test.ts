/**
 * #226 §4 导出一致性：独立文档（HTML/PDF 共用）的主题跟随与「打印不裁切」口径。
 * 这里断言的是导出**产物文本**（不跑 html2canvas/打印对话框），因此它锁住的是可回归的那部分契约。
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  EXPORT_FRAMING_CSS,
  LAYER_STATEMENT,
  buildExportCss,
  buildThemedStandaloneHTML,
  collectDocumentCss,
  currentThemeDescriptor,
} from "../../src/lib/exportTheme";

const BODY = "<h1>标题</h1><p>正文</p>";

function docWithStyles(...styles: string[]): Document {
  const doc = document.implementation.createHTMLDocument("t");
  for (const css of styles) {
    const el = doc.createElement("style");
    el.textContent = css;
    doc.head.appendChild(el);
  }
  return doc;
}

describe("#226 导出：主题描述符", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-theme-id");
  });

  it("从文档根读 data-theme / data-theme-id（缺失时回落默认主题）", () => {
    expect(currentThemeDescriptor()).toEqual({
      themeId: "builtin:light",
      mode: "light",
    });
    document.documentElement.setAttribute("data-theme", "dark");
    document.documentElement.setAttribute("data-theme-id", "bundled:drake-dark");
    expect(currentThemeDescriptor()).toEqual({
      themeId: "bundled:drake-dark",
      mode: "dark",
    });
  });
});

describe("#226 导出：独立文档的样式与结构", () => {
  it("层序声明与 index.html 同句，且在样式最前", () => {
    const css = buildExportCss(['@layer base { .editor-scroll .milkdown { color: #111 } }']);
    expect(css.startsWith(LAYER_STATEMENT)).toBe(true);
    expect(css.split("\n")[0]).toBe("@layer base, theme, user;");
  });

  it("内联当前文档的样式表（保持顺序）→ 主题/自定义 CSS 一并跟随", async () => {
    const doc = docWithStyles(
      "@layer base { .editor-scroll .milkdown { color: #111 } }",
      '@layer theme { .editor-scroll .milkdown { color: #eee } }',
      "@layer user { .editor-scroll .milkdown { color: #f00 } }",
    );
    const { sheets, skipped } = await collectDocumentCss(doc);
    expect(skipped).toEqual([]);
    expect(sheets).toHaveLength(3);
    const css = buildExportCss(sheets);
    // 三个层的内容都在，且顺序 = 文档顺序（层内后者胜 + 层序 base < theme < user）
    expect(css.indexOf("#111")).toBeLessThan(css.indexOf("#eee"));
    expect(css.indexOf("#eee")).toBeLessThan(css.indexOf("#f00"));
  });

  it("取不到的样式表（link 跨域/失败）不静默：计入 skipped 但不影响产物", async () => {
    const doc = document.implementation.createHTMLDocument("t");
    const link = doc.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://example.invalid/x.css";
    doc.head.appendChild(link);
    const failing = (async () => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    const { sheets, skipped } = await collectDocumentCss(doc, failing);
    expect(sheets).toEqual([]);
    expect(skipped[0]).toContain("example.invalid/x.css");
    expect(skipped[0]).toContain("boom");
    expect(buildExportCss(sheets)).toContain(LAYER_STATEMENT);
  });

  it("正文包回 `.editor-scroll > .milkdown` 两层（否则后代选择器一行都不命中）", () => {
    const html = buildThemedStandaloneHTML(BODY, "t", [], { themeId: "builtin:light", mode: "light" });
    expect(html).toContain('<div class="editor-scroll"><div class="milkdown"><h1>标题</h1>');
    expect(html).toContain("</div></div>");
  });

  it("`<html>` 上带 data-theme / data-theme-id（主题选择器与元数据都对齐页面）", () => {
    const html = buildThemedStandaloneHTML(BODY, "t", [], {
      themeId: "bundled:notion-dark",
      mode: "dark",
    });
    expect(html).toContain('data-theme="dark"');
    expect(html).toContain('data-theme-id="bundled:notion-dark"');
    expect(html).toContain(LAYER_STATEMENT);
  });

  it("标题转义（不引入 XSS/破结构）", () => {
    const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = buildThemedStandaloneHTML(BODY, '<script>x</script>', [], { themeId: "builtin:light", mode: "light" }, escape);
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
  });
});

describe("#226 导出：纸张骨架只写结构、打印不裁切", () => {
  it("骨架里不含颜色/字体声明（否则未分层会盖掉主题层）", () => {
    expect(EXPORT_FRAMING_CSS).not.toMatch(/(^|[;{\s])(color|background|font-family|border-color)\s*:/i);
  });

  it("打印规则显式放开滚动容器的裁切（验收项：`.editor-scroll` 不被裁切）", () => {
    expect(EXPORT_FRAMING_CSS).toMatch(/@media print/);
    const printBlock = EXPORT_FRAMING_CSS.slice(EXPORT_FRAMING_CSS.indexOf("@media print"));
    expect(printBlock).toMatch(/\.editor-scroll\s*\{[^}]*overflow:\s*visible/);
    expect(printBlock).toMatch(/\.editor-scroll\s*\{[^}]*height:\s*auto/);
  });

  it("骨架在所有层之外（未分层）→ 稳定覆盖应用的结构性声明", () => {
    const css = buildExportCss([]);
    expect(css.indexOf(LAYER_STATEMENT)).toBeLessThan(css.indexOf("body { max-width"));
    // 骨架自身不带 layer 包裹
    expect(css).not.toMatch(/@layer\s+\w+\s*\{\s*body\s*\{/);
  });
});
