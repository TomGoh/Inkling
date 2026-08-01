import { EditorView, lineNumbers, drawSelection, keymap, highlightActiveLine, highlightSpecialChars } from "@codemirror/view";
import type { ViewUpdate } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { LanguageDescription, LanguageSupport, StreamLanguage, bracketMatching, indentOnInput, defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { indentWithTab } from "@codemirror/commands";
import { oneDark } from "@codemirror/theme-one-dark";
import type { NodeView } from "@milkdown/kit/prose/view";
import { TextSelection } from "@milkdown/kit/prose/state";
import { exitCode } from "@milkdown/kit/prose/commands";
import { undo, redo } from "@milkdown/kit/prose/history";
import { $view } from "@milkdown/kit/utils";
import { codeBlockSchema } from "@milkdown/kit/preset/commonmark";
import type { Node } from "@milkdown/kit/prose/model";
import type { EditorView as PMView } from "@milkdown/kit/prose/view";
import { createMermaidView } from "./mermaid-view";
import { useSettings, type CodeBlockTheme } from "../../store/settings";

/**
 * 代码块支持的语言列表。
 * 常用语言用独立包（动态 import），其余用 legacy-modes（StreamLanguage）。
 * 未匹配的语言退化为纯文本。
 */
const codeLanguages: LanguageDescription[] = [
  LanguageDescription.of({ name: "javascript", alias: ["js", "jsx"], load: async () => (await import("@codemirror/lang-javascript")).javascript({ jsx: true }) }),
  LanguageDescription.of({ name: "typescript", alias: ["ts", "tsx"], load: async () => (await import("@codemirror/lang-javascript")).javascript({ typescript: true, jsx: true }) }),
  LanguageDescription.of({ name: "python", alias: ["py"], load: async () => (await import("@codemirror/lang-python")).python() }),
  LanguageDescription.of({ name: "rust", alias: ["rs"], load: async () => (await import("@codemirror/lang-rust")).rust() }),
  LanguageDescription.of({ name: "cpp", alias: ["c", "c++", "h"], load: async () => (await import("@codemirror/lang-cpp")).cpp() }),
  LanguageDescription.of({ name: "java", alias: [], load: async () => (await import("@codemirror/lang-java")).java() }),
  LanguageDescription.of({ name: "html", alias: [], load: async () => (await import("@codemirror/lang-html")).html() }),
  LanguageDescription.of({ name: "css", alias: ["scss"], load: async () => (await import("@codemirror/lang-css")).css() }),
  LanguageDescription.of({ name: "json", alias: [], load: async () => (await import("@codemirror/lang-json")).json() }),
  LanguageDescription.of({ name: "sql", alias: [], load: async () => (await import("@codemirror/lang-sql")).sql() }),
  LanguageDescription.of({ name: "markdown", alias: ["md"], load: async () => (await import("@codemirror/lang-markdown")).markdown() }),
  LanguageDescription.of({ name: "xml", alias: [], load: async () => (await import("@codemirror/lang-xml")).xml() }),
  LanguageDescription.of({ name: "yaml", alias: ["yml"], load: async () => (await import("@codemirror/lang-yaml")).yaml() }),
  // legacy-modes 提供的额外语言
  LanguageDescription.of({ name: "go", alias: ["golang"], load: async () => new LanguageSupport(StreamLanguage.define((await import("@codemirror/legacy-modes/mode/go")).go)) }),
  LanguageDescription.of({ name: "ruby", alias: ["rb"], load: async () => new LanguageSupport(StreamLanguage.define((await import("@codemirror/legacy-modes/mode/ruby")).ruby)) }),
  LanguageDescription.of({ name: "shell", alias: ["sh", "bash"], load: async () => new LanguageSupport(StreamLanguage.define((await import("@codemirror/legacy-modes/mode/shell")).shell)) }),
  LanguageDescription.of({ name: "dockerfile", alias: [], load: async () => new LanguageSupport(StreamLanguage.define((await import("@codemirror/legacy-modes/mode/dockerfile")).dockerFile)) }),
  LanguageDescription.of({ name: "diff", alias: [], load: async () => new LanguageSupport(StreamLanguage.define((await import("@codemirror/legacy-modes/mode/diff")).diff)) }),
  LanguageDescription.of({ name: "toml", alias: [], load: async () => new LanguageSupport(StreamLanguage.define((await import("@codemirror/legacy-modes/mode/toml")).toml)) }),
];

/** 根据语言名查找并加载 LanguageSupport */
function loadLanguage(name: string): Promise<LanguageSupport | undefined> {
  const lower = name.toLowerCase();
  const desc = codeLanguages.find((l) => l.name === lower || l.alias.includes(lower));
  if (!desc) return Promise.resolve(undefined);
  return desc.load();
}

/** CodeMirror 基础主题：编辑器外观、行号、字体 */
const baseTheme = EditorView.theme({
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
function codeThemeExt(name: CodeBlockTheme): Extension[] {
  switch (name) {
    case "oneDark":
      return [oneDark];
    case "light":
      // defaultHighlightStyle 是 CodeMirror 内置浅色彩色语法高亮
      return [syntaxHighlighting(defaultHighlightStyle)];
    case "none":
      return [];
  }
}

/** 计算旧/新文本的最小变更区间，用于精准同步 */
function computeChange(oldVal: string, newVal: string) {
  if (oldVal === newVal) return null;
  let start = 0;
  let oldEnd = oldVal.length;
  let newEnd = newVal.length;
  while (start < oldEnd && oldVal.charCodeAt(start) === newVal.charCodeAt(start)) ++start;
  while (oldEnd > start && newEnd > start && oldVal.charCodeAt(oldEnd - 1) === newVal.charCodeAt(newEnd - 1)) {
    oldEnd--;
    newEnd--;
  }
  return { from: start, to: oldEnd, text: newVal.slice(start, newEnd) };
}

/**
 * 代码块的 ProseMirror NodeView：内嵌 CodeMirror 6 编辑器，
 * 提供语法高亮、行号、语言切换，并把编辑同步回 ProseMirror 文档。
 *
 * 性能：CodeMirror 实例延迟到代码块进入视口时才创建（IntersectionObserver），
 * 大量代码块文档下避免一次性初始化上百个编辑器实例。
 */
class CodeBlockNodeView implements NodeView {
  dom: HTMLElement;
  cm: EditorView | null = null;
  private node: Node;
  private view: PMView;
  private getPos: () => number | undefined;
  private langConf = new Compartment();
  private readOnlyConf = new Compartment();
  private themeConf = new Compartment();
  private updating = false;
  private languageName = "";
  private currentTheme: CodeBlockTheme;
  private unsub: () => void;
  private io: IntersectionObserver | null = null;
  private cmHost: HTMLElement;
  private select: HTMLSelectElement;

  constructor(node: Node, view: PMView, getPos: () => number | undefined) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.currentTheme = useSettings.getState().codeBlockTheme;

    this.dom = document.createElement("div");
    this.dom.className = "code-block";
    this.dom.dataset.codeTheme = this.currentTheme;

    // 顶部工具栏：语言选择
    const toolbar = document.createElement("div");
    toolbar.className = "code-block-toolbar";
    this.select = this.buildLangSelect(node.attrs.language ?? "");
    this.select.addEventListener("change", () => {
      const pos = getPos();
      if (pos == null) return;
      view.dispatch(view.state.tr.setNodeAttribute(pos, "language", this.select.value));
    });
    toolbar.appendChild(this.select);
    this.dom.appendChild(toolbar);

    // CodeMirror 宿主
    this.cmHost = document.createElement("div");
    this.cmHost.className = "code-block-cm";
    this.dom.appendChild(this.cmHost);

    // 视口懒挂载：先尝试同步创建（若已在视口或 IO 不可用），
    // 否则注册 IntersectionObserver，进入视口时再创建。
    if (typeof IntersectionObserver === "undefined") {
      this.initCodeMirror();
    } else {
      this.io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting && !this.cm) {
              this.initCodeMirror();
              this.io?.disconnect();
              this.io = null;
            }
          }
        },
        { rootMargin: "200px" },
      );
      this.io.observe(this.dom);
    }

    // 监听代码块主题切换，实时重配 CodeMirror 主题（实例未创建时仅记录，创建时生效）
    this.unsub = useSettings.subscribe((s) => {
      if (s.codeBlockTheme === this.currentTheme) return;
      this.currentTheme = s.codeBlockTheme;
      this.dom.dataset.codeTheme = s.codeBlockTheme;
      if (this.cm) {
        this.cm.dispatch({
          effects: this.themeConf.reconfigure(codeThemeExt(s.codeBlockTheme)),
        });
      }
    });
  }

  /** 创建 CodeMirror 实例并同步当前节点内容/语言 */
  private initCodeMirror() {
    if (this.cm) return;
    this.cm = new EditorView({
      doc: this.node.textContent,
      extensions: [
        this.themeConf.of(codeThemeExt(this.currentTheme)),
        this.readOnlyConf.of(EditorState.readOnly.of(!this.view.editable)),
        lineNumbers(),
        drawSelection(),
        highlightSpecialChars(),
        highlightActiveLine(),
        bracketMatching(),
        indentOnInput(),
        keymap.of(this.buildKeymap()),
        this.langConf.of([]),
        baseTheme,
        EditorView.updateListener.of((u) => this.forwardUpdate(u)),
      ],
    });
    this.cmHost.appendChild(this.cm.dom);
    this.updateLanguage(this.node.attrs.language ?? "");
  }

  /** 构建语言下拉框 */
  private buildLangSelect(current: string): HTMLSelectElement {
    const select = document.createElement("select");
    select.className = "code-block-lang";
    const options = ["text", ...codeLanguages.map((l) => l.name)];
    for (const name of options) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      if (name === (current || "text")) opt.selected = true;
      select.appendChild(opt);
    }
    return select;
  }

  /** CodeMirror 内的快捷键：方向键逃离代码块、撤销重做转发到 ProseMirror */
  private buildKeymap() {
    const view = this.view;
    return [
      { key: "ArrowUp", run: () => this.maybeEscape("line", -1) },
      { key: "ArrowLeft", run: () => this.maybeEscape("char", -1) },
      { key: "ArrowDown", run: () => this.maybeEscape("line", 1) },
      { key: "ArrowRight", run: () => this.maybeEscape("char", 1) },
      {
        key: "Mod-Enter",
        run: () => {
          if (!exitCode(view.state, view.dispatch)) return false;
          view.focus();
          return true;
        },
      },
      { key: "Mod-z", run: () => undo(view.state, view.dispatch) },
      { key: "Shift-Mod-z", run: () => redo(view.state, view.dispatch) },
      { key: "Mod-y", run: () => redo(view.state, view.dispatch) },
      indentWithTab,
    ];
  }

  /** 光标在代码块边界时，逃离到外部 ProseMirror 文档 */
  private maybeEscape(unit: "line" | "char", dir: number): boolean {
    // keymap 仅在 CodeMirror 获焦时触发，此时实例必已创建；防御性判空
    if (!this.cm) return false;
    const { state } = this.cm;
    const main = state.selection.main;
    if (!main.empty) return false;
    let from = main.from;
    let to = main.to;
    if (unit === "line") {
      const line = state.doc.lineAt(main.head);
      from = line.from;
      to = line.to;
    }
    if (dir < 0 ? from > 0 : to < state.doc.length) return false;
    const pos = this.getPos();
    if (pos == null) return false;
    const targetPos = pos + (dir < 0 ? 0 : this.node.nodeSize);
    const selection = TextSelection.near(this.view.state.doc.resolve(targetPos), dir);
    this.view.dispatch(this.view.state.tr.setSelection(selection).scrollIntoView());
    this.view.focus();
    return true;
  }

  /** CodeMirror 变更同步到 ProseMirror */
  private forwardUpdate = (update: ViewUpdate) => {
    if (this.updating || !this.cm || !this.cm.hasFocus) return;
    let offset = (this.getPos() ?? 0) + 1;
    const { main } = update.state.selection;
    const selFrom = offset + main.from;
    const selTo = offset + main.to;
    const pmSel = this.view.state.selection;
    if (update.docChanged || pmSel.from !== selFrom || pmSel.to !== selTo) {
      const tr = this.view.state.tr;
      update.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
        if (inserted.length) tr.replaceWith(offset + fromA, offset + toA, this.view.state.schema.text(inserted.toString()));
        else tr.delete(offset + fromA, offset + toA);
        offset += toB - fromB - (toA - fromA);
      });
      tr.setSelection(TextSelection.create(tr.doc, selFrom, selTo));
      this.view.dispatch(tr);
    }
  };

  /** 加载并切换语言高亮 */
  private updateLanguage(language: string) {
    if (language === this.languageName) return;
    this.languageName = language;
    loadLanguage(language).then((support) => {
      // 实例可能尚未创建（视口外），languageName 已更新，创建时会用最新值
      if (this.cm) {
        this.cm.dispatch({ effects: this.langConf.reconfigure(support ? [support] : []) });
      }
    }).catch(console.error);
  }

  /** ProseMirror 节点变更同步到 CodeMirror */
  update(node: Node): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    // CodeMirror 未创建（视口外）：仅更新 node 引用，待进入视口创建时从 node 取最新内容
    if (!this.cm) return true;
    if (this.updating) return true;
    // 同步语言
    const lang = node.attrs.language ?? "";
    if (lang !== this.languageName) this.updateLanguage(lang);
    // 同步只读状态
    if (this.view.editable === this.cm.state.readOnly) {
      this.cm.dispatch({
        effects: this.readOnlyConf.reconfigure(EditorState.readOnly.of(!this.view.editable)),
      });
    }
    // 同步文本
    const change = computeChange(this.cm.state.doc.toString(), node.textContent);
    if (change) {
      this.updating = true;
      this.cm.dispatch({ changes: { from: change.from, to: change.to, insert: change.text }, scrollIntoView: true });
      this.updating = false;
    }
    return true;
  }

  setSelection(anchor: number, head: number) {
    if (!this.cm) return;
    this.cm.focus();
    this.updating = true;
    this.cm.dispatch({ selection: { anchor, head } });
    this.updating = false;
  }

  selectNode() {
    if (!this.cm) return;
    this.cm.focus();
  }

  deselectNode() {}

  stopEvent() {
    return true;
  }

  ignoreMutation() {
    return true;
  }

  destroy() {
    this.unsub();
    this.io?.disconnect();
    this.io = null;
    this.cm?.destroy();
    this.cm = null;
  }
}

/**
 * 代码块 NodeView 插件：用 CodeMirror 替换默认渲染。
 * 语言为 mermaid 的代码块走 Mermaid 图表渲染，其余走 CodeMirror 高亮。
 */
export const codeBlockView = $view(codeBlockSchema.node, () => (node, view, getPos) => {
  if (node.attrs.language === "mermaid") {
    return createMermaidView(node, view, getPos);
  }
  return new CodeBlockNodeView(node, view, getPos);
});
