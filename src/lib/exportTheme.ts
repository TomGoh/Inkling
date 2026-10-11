/**
 * #226 §4：**导出与主题一致**（PNG / HTML / PDF 三路共用一套容器与样式口径）。
 *
 * 三路裁决（设计集 `04` §4.2 + A-4）：
 * - **PNG 长图**：离屏容器**追加到当前文档** → 复用 `<head>` 里已有的样式表（含 `#inkling-theme`），
 *   **不得**再注入第二份主题 CSS（否则层序/DOM 顺序与页面不一致，是 A-4 明确禁止的写法）；
 *   容器只需复刻 `[data-theme] > .editor-scroll > .milkdown` 三层 + 复制 `data-theme` / `data-theme-id`。
 * - **HTML 导出**：产物是**独立文档** → 此时才需要**内联**样式：先写层序声明（与 `index.html` 同一句），
 *   再内联**当前文档的样式表**（原样、保持顺序，各表的 `@layer` 归属不变），并把正文包回
 *   `.editor-scroll > .milkdown` 两层结构（应用与主题规则都是这两层下的**后代选择器**）。
 * - **PDF 打印**：打印的就是上述独立文档 → 打印样式必须**不裁切**滚动容器
 *   （`.editor-scroll` 在应用样式里是 `height:100% / overflow:auto`，独立文档里会切掉内容）。
 *
 * ⚠️ 独立文档的「纸张骨架」放在**最外层（不带 layer）**：未分层规则胜过任何层，故能稳定覆盖应用的结构性
 * 声明；但它**只允许写结构属性**（宽度/外边距/高度/溢出），不得写颜色/字体 —— 否则会盖掉主题层
 * （测试里对此有断言，防止以后漂移）。
 */
import { BUILTIN_LIGHT_ID, DEFAULT_THEME_ID } from "../theme/registry";

export interface ExportThemeDescriptor {
  /** 当前主题身份（写入 `data-theme-id`，供诊断/元数据；选择器锚点仍是 `data-theme`） */
  themeId: string;
  /** `data-theme` 取值（light / dark，与页面一致） */
  mode: "light" | "dark";
}

/** 当前主题描述符（从文档根属性读取；缺失时回落默认主题，保证导出永不“无主题”） */
export function currentThemeDescriptor(doc: Document = document): ExportThemeDescriptor {
  const root = doc.documentElement;
  const themeId = root.getAttribute("data-theme-id") ?? DEFAULT_THEME_ID ?? BUILTIN_LIGHT_ID;
  const mode = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
  return { themeId, mode };
}

/** 应用自身的层序声明（与 `index.html` 逐字一致：唯一落点，不另立口径） */
export const LAYER_STATEMENT = "@layer base, theme, user;";

/**
 * 独立文档的「纸张骨架」：**只写结构属性**，且放在所有层之外（未分层优先级最高）。
 * 打印规则同在此处（`@media print`），保证 `.editor-scroll` 不被裁切。
 */
export const EXPORT_FRAMING_CSS = `html { color-scheme: light dark; }
body { max-width: 780px; margin: 2rem auto; padding: 0 1rem; -webkit-font-smoothing: antialiased; }
.editor-scroll { height: auto; overflow: visible; }
/* 打印：不裁切滚动容器、去掉纸张外边距（#226 §4.2 验收项） */
@media print {
  body { max-width: none; margin: 0; padding: 0.5cm; }
  .editor-scroll { height: auto; overflow: visible; }
}`;

/**
 * 收集当前文档的样式表文本（保持文档顺序）。
 * - `<style>`：直接取 `textContent`（含我们注入的 `#inkling-theme` / 自定义 CSS，以及 dev 下 Vite 注入的模块样式）；
 * - `<link rel=stylesheet>`：同源 `fetch` 取文本（生产构建下应用样式是 link）；
 * - 取不到的（跨域/网络失败）跳过并登记，便于导出后排查而不是静默丢样式。
 */
export async function collectDocumentCss(
  doc: Document = document,
  fetcher: typeof fetch = fetch,
): Promise<{ sheets: string[]; skipped: string[] }> {
  const sheets: string[] = [];
  const skipped: string[] = [];
  const nodes = doc.querySelectorAll<HTMLStyleElement | HTMLLinkElement>(
    'style, link[rel="stylesheet"]',
  );
  for (const node of Array.from(nodes)) {
    if (node.tagName === "STYLE") {
      const text = node.textContent ?? "";
      if (text.trim()) sheets.push(text);
      continue;
    }
    const href = (node as HTMLLinkElement).href;
    if (!href) continue;
    try {
      const res = await fetcher(href);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      sheets.push(await res.text());
    } catch (e) {
      skipped.push(`${href}（${e instanceof Error ? e.message : String(e)}）`);
    }
  }
  return { sheets, skipped };
}

/** 独立文档的完整 `<style>` 内容：层序声明 → 纸张骨架（未分层） → 原样内联的文档样式表 */
export function buildExportCss(sheets: readonly string[]): string {
  return [LAYER_STATEMENT, EXPORT_FRAMING_CSS, ...sheets].join("\n").trim();
}

/**
 * 把导出正文包回应用的两层结构：`.editor-scroll > .milkdown`。
 * 应用与主题的选择器都是这两层下的后代（`[data-theme] > .editor-scroll > .milkdown …`），
 * 少了它们，独立文档里一行样式都不会命中。
 */
export function wrapExportBody(bodyHTML: string): string {
  return `<div class="editor-scroll"><div class="milkdown">${bodyHTML}</div></div>`;
}

/** 生成独立 HTML 文档（主题跟随；`skipped` 仅用于日志，不影响产物） */
export function buildThemedStandaloneHTML(
  bodyHTML: string,
  title: string,
  sheets: readonly string[],
  descriptor: ExportThemeDescriptor,
  escape: (s: string) => string = (s) => s,
): string {
  const css = buildExportCss(sheets);
  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="${descriptor.mode}" data-theme-id="${escape(descriptor.themeId)}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escape(title)}</title>
<style>
${css}
</style>
</head>
<body>
${wrapExportBody(bodyHTML)}
</body>
</html>`;
}
