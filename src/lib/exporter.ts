// 导出功能：HTML / PDF
// HTML：取编辑器渲染后的 DOM + 内联基础样式，打包成独立可打开的 html 文件
// PDF：在新窗口打开 HTML 并调用浏览器打印（用户选「另存为 PDF」）
// 这样不依赖外部 Pandoc，绿色版开箱即用。

import type { Editor } from "@milkdown/kit/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { useWorkspace } from "../store/workspace";
import { resolvePathFromDocument } from "./fs";
import { parseOutline } from "./outline";

/** 从编辑器获取渲染后的 HTML 内容 */
function getEditorHTML(getEditor: () => Editor | undefined): string {
  const editor = getEditor();
  if (!editor) return "";
  const html = editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    // 克隆编辑器 DOM，移除 ProseMirror 的编辑态属性
    const clone = view.dom.cloneNode(true) as HTMLElement;
    clone.removeAttribute("contenteditable");
    clone.removeAttribute("role");
    clone.classList.remove("ProseMirror");
    return clone.innerHTML;
  });
  return html;
}

/** 当前文件名（去掉扩展名），作为导出文件默认名 */
function getBaseName(): string {
  const f = useWorkspace.getState().currentFile;
  if (!f) return "untitled";
  return f.split(/[\\/]/).pop()!.replace(/\.md$/i, "") || "untitled";
}

/** 生成完整的独立 HTML 文档（含内联样式，无外部依赖） */
function buildStandaloneHTML(bodyHTML: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHTML(title)}</title>
<style>
:root { color-scheme: light; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 16px; line-height: 1.6; color: #1f2328; background: #fff;
  max-width: 780px; margin: 2rem auto; padding: 0 1rem;
  -webkit-font-smoothing: antialiased;
}
h1,h2,h3,h4,h5,h6 { font-weight: 600; line-height: 1.25; margin: 1.5em 0 0.6em; }
h1 { font-size: 1.9em; border-bottom: 1px solid #d0d7de; padding-bottom: 0.3em; }
h2 { font-size: 1.5em; border-bottom: 1px solid #d0d7de; padding-bottom: 0.3em; }
h3 { font-size: 1.25em; } h4 { font-size: 1em; }
p { margin: 0 0 0.8em; }
a { color: #0969da; text-decoration: none; } a:hover { text-decoration: underline; }
img { max-width: 100%; }
code { font-family: "SFMono-Regular", Consolas, monospace; font-size: 0.88em;
  background: rgba(175,184,193,0.2); padding: 0.2em 0.4em; border-radius: 4px; }
pre { background: #f6f8fa; padding: 0.9em; border-radius: 6px; overflow: auto; margin: 0 0 1em; }
pre code { background: none; padding: 0; font-size: 0.85em; }
blockquote { margin: 0 0 1em; padding: 0 1em; color: #57606a;
  border-left: 0.25em solid #d0d7de; }
table { border-collapse: collapse; margin: 0 0 1em; display: block; overflow: auto; }
th, td { padding: 6px 13px; border: 1px solid #d0d7de; }
th { font-weight: 600; background: #f6f8fa; }
hr { border: none; border-top: 1px solid #d0d7de; margin: 1.5em 0; }
ul, ol { padding-left: 2em; margin: 0 0 1em; }
.math-inline .katex { font-size: 1.05em; }
.math-display { margin: 0.75em 0; text-align: center; overflow-x: auto; }
.mermaid-block { text-align: center; margin: 1em 0; }
.mermaid-block svg { max-width: 100%; }
@media print {
  body { max-width: none; margin: 0; padding: 0.5cm; }
  a { color: #000; }
}
</style>
</head>
<body>
${bodyHTML}
</body>
</html>`;
}

function escapeHTML(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 导出为 HTML 文件（保存到用户选择的位置） */
export async function exportHTML(
  getEditor: () => Editor | undefined,
): Promise<void> {
  const bodyHTML = getEditorHTML(getEditor);
  if (!bodyHTML) return;
  const name = getBaseName();
  const fullHTML = buildStandaloneHTML(bodyHTML, name);

  if (isTauri()) {
    const path = await save({
      defaultPath: `${name}.html`,
      filters: [{ name: "HTML", extensions: ["html"] }],
    });
    if (!path) return;
    await invoke<void>("write_text_file", { filePath: path, content: fullHTML });
  } else {
    // 浏览器：触发下载
    downloadBlob(new Blob([fullHTML], { type: "text/html" }), `${name}.html`);
  }
}

/** 导出为 PDF：打开 HTML 新窗口并调用浏览器打印 */
export async function exportPDF(
  getEditor: () => Editor | undefined,
): Promise<void> {
  const bodyHTML = getEditorHTML(getEditor);
  if (!bodyHTML) return;
  const name = getBaseName();
  const fullHTML = buildStandaloneHTML(bodyHTML, name);

  // 新窗口打开并立即打印
  const win = window.open("", "_blank");
  if (!win) {
    alert("无法打开新窗口，请检查浏览器弹窗拦截设置");
    return;
  }
  win.document.open();
  win.document.write(fullHTML);
  win.document.close();
  // 等待内容渲染后触发打印
  win.onload = () => {
    setTimeout(() => {
      win.focus();
      win.print();
    }, 300);
  };
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 复制当前 Markdown 源码到剪贴板（纯文本） */
export async function copyMarkdown(): Promise<boolean> {
  const content = useWorkspace.getState().currentContent;
  try {
    await navigator.clipboard.writeText(content);
    return true;
  } catch {
    return false;
  }
}

/** 检查系统是否安装 pandoc（仅桌面端有效） */
export async function checkPandoc(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    return await invoke<boolean>("pandoc_check");
  } catch {
    return false;
  }
}

/**
 * 导出为 Word（.docx），走 Pandoc
 * - 仅桌面端可用：浏览器端无法调用本地 pandoc
 * - 未安装 pandoc 时返回错误，由调用方提示用户安装
 */
export async function exportDocx(): Promise<{
  ok: boolean;
  error?: string;
}> {
  if (!isTauri()) {
    return { ok: false, error: "Word 导出仅在桌面端可用（需调用 Pandoc）" };
  }
  const installed = await checkPandoc();
  if (!installed) {
    return {
      ok: false,
      error: "未检测到 Pandoc，请先安装：https://pandoc.org/installing.html",
    };
  }
  const content = useWorkspace.getState().currentContent;
  if (!content) return { ok: false, error: "无内容可导出" };
  const name = getBaseName();
  const currentFile = useWorkspace.getState().currentFile;

  try {
    const resourceDir = currentFile
      ? await resolvePathFromDocument(currentFile)
      : null;
    const path = await save({
      defaultPath: `${name}.docx`,
      filters: [{ name: "Word 文档", extensions: ["docx"] }],
    });
    if (!path) return { ok: false };

    await invoke<void>("pandoc_export_docx", {
      markdown: content,
      outputPath: path,
      resourceDir,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 复制编辑器渲染结果为富文本（text/html + text/plain 回退） */
export async function copyRichText(
  getEditor: () => Editor | undefined,
): Promise<boolean> {
  const html = getEditorHTML(getEditor);
  if (!html) return false;
  const text = useWorkspace.getState().currentContent;
  try {
    const htmlBlob = new Blob([html], { type: "text/html" });
    const textBlob = new Blob([text], { type: "text/plain" });
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": htmlBlob,
        "text/plain": textBlob,
      }),
    ]);
    return true;
  } catch {
    // ClipboardItem 不支持时回退到纯文本
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * 导出为 PNG 长图：用 html2canvas 把编辑器渲染结果截图。
 * - 在离屏容器中以「只读展示样式」渲染一份完整文档副本，避免编辑态属性干扰
 * - 仅桌面端保存到用户选择路径；浏览器端触发下载
 */
export async function exportPNG(
  getEditor: () => Editor | undefined,
): Promise<void> {
  const { default: html2canvas } = await import("html2canvas");
  const bodyHTML = getEditorHTML(getEditor);
  if (!bodyHTML) return;
  const name = getBaseName();

  // 离屏容器：白底、固定宽度、去掉编辑态
  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;left:-99999px;top:0;width:780px;padding:32px 40px;background:#fff;color:#1f2328;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;line-height:1.6;";
  container.innerHTML = bodyHTML;
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      backgroundColor: "#ffffff",
      scale: 2, // 2 倍清晰度
      useCORS: true,
      logging: false,
    });
    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob 失败"))),
        "image/png",
      ),
    );

    if (isTauri()) {
      const path = await save({
        defaultPath: `${name}.png`,
        filters: [{ name: "PNG 图片", extensions: ["png"] }],
      });
      if (!path) return;
      const buf = new Uint8Array(await blob.arrayBuffer());
      await invoke<void>("write_binary_file", {
        filePath: path,
        data: Array.from(buf),
      });
    } else {
      downloadBlob(blob, `${name}.png`);
    }
  } finally {
    document.body.removeChild(container);
  }
}

/**
 * 导出文档大纲：只保留标题层级，生成只含标题的 markdown 文件，可作为目录使用。
 * - 标题层级用缩进列表表示，便于一眼看出层级关系
 * - 同时输出原始 # 语法，兼容 GitHub 等渲染器
 */
export async function exportOutline(): Promise<void> {
  const content = useWorkspace.getState().currentContent;
  if (!content) return;
  const name = getBaseName();
  const headings = parseOutline(content);

  // 用缩进列表表示层级：H1 顶层，每深一级缩进 2 空格
  const lines: string[] = [`# ${name} 目录`, ""];
  for (const h of headings) {
    const indent = "  ".repeat(Math.max(0, h.level - 1));
    lines.push(`${indent}- ${h.text}`);
  }
  // 末尾附原始标题语法，便于直接作为新文档骨架
  lines.push("", "---", "", "## 原始标题结构", "");
  for (const h of headings) {
    lines.push(`${"#".repeat(h.level)} ${h.text}`);
  }
  const md = lines.join("\n");

  if (isTauri()) {
    const path = await save({
      defaultPath: `${name}-outline.md`,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (!path) return;
    await invoke<void>("write_text_file", { filePath: path, content: md });
  } else {
    downloadBlob(new Blob([md], { type: "text/markdown" }), `${name}-outline.md`);
  }
}
