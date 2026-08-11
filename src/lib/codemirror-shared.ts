// CodeMirror 6 共享主题与扩展工厂
// 供代码块 NodeView 与源代码模式编辑器复用

import { history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import type { CodeBlockTheme } from "../store/settings";

/** CodeMirror 基础主题：编辑器外观、行号、字体 */
export const sharedCodeMirrorBaseTheme = EditorView.theme({
  "&": {
    fontSize: "0.85rem",
    backgroundColor: "transparent",
    color: "var(--code-block-text, var(--text, #1f2328))",
  },
  "&.cm-editor": {
    backgroundColor: "transparent",
  },
  ".cm-scroller": {
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
    lineHeight: "1.5",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--code-block-muted, var(--text-muted, #6e7681))",
    border: "none",
    borderRight: "1px solid var(--code-block-gutter-border, var(--border, #d0d7de))",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(175, 184, 193, 0.15)",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(175, 184, 193, 0.1)",
  },
  ".cm-content": {
    padding: "0.4rem 0",
    caretColor: "var(--code-block-focus, #528bff)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--code-block-focus, #528bff)",
  },
});

/** 根据主题名返回 CodeMirror 主题扩展 */
export function codeThemeExt(name: CodeBlockTheme): Extension[] {
  switch (name) {
    case "oneDark":
      return [oneDark];
    case "light":
      return [syntaxHighlighting(defaultHighlightStyle)];
    case "none":
      return [];
  }
}

/** 源码模式用的 GFM Markdown 语言支持 */
export function createMarkdownLanguageSupport() {
  return markdown();
}

export interface SourceModeExtensionOpts {
  codeBlockTheme: CodeBlockTheme;
  /** 是否只读（fallback 不用这个函数） */
  readOnly?: boolean;
  /** 是否启用浏览器拼写检查 */
  spellcheck?: boolean;
}

/** 源代码模式 CodeMirror 扩展组合 */
export function createSourceModeExtensions(opts: SourceModeExtensionOpts): Extension[] {
  const exts: Extension[] = [
    lineNumbers(),
    highlightSpecialChars(),
    drawSelection(),
    highlightActiveLine(),
    bracketMatching(),
    indentOnInput(),
    history(),
    keymap.of([...historyKeymap, indentWithTab]),
    sharedCodeMirrorBaseTheme,
    createMarkdownLanguageSupport(),
    EditorView.lineWrapping,
  ];
  exts.push(...codeThemeExt(opts.codeBlockTheme));
  if (opts.readOnly) {
    exts.push(EditorView.editable.of(false));
  }
  if (opts.spellcheck) {
    exts.push(EditorView.contentAttributes.of({ spellcheck: "true" }));
  }
  return exts;
}
