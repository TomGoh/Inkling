// 块级插入/转换命令：供工具栏按钮复用。
// 与斜杠菜单的插入逻辑等价，但不依赖 `/` 触发位置——直接在当前选区操作：
// - 转换类（标题/代码块/Mermaid）：把当前所在顶层块改为目标类型
// - 包裹类（列表/引用）：wrap 当前块
// - 插入类（分割线/公式/callout/TOC）：在当前块之后插入新块
// - frontmatter：插在文档首部

import type { EditorView } from "@milkdown/kit/prose/view";

/** 包裹当前选区所在块为指定节点（列表/引用） */
function wrapBlock(view: EditorView, nodeType: any): void {
  const { $from, $to } = view.state.selection;
  const range = $from.blockRange($to);
  if (!range) return;
  view.dispatch(view.state.tr.wrap(range, [{ type: nodeType }]).scrollIntoView());
  view.focus();
}

/** 在当前顶层块之后插入新节点 */
function insertNodeAfter(view: EditorView, node: any): void {
  const pos = view.state.selection.$from.after();
  view.dispatch(view.state.tr.insert(pos, node).scrollIntoView());
  view.focus();
}

/** 转换当前块为指定类型（保留选区位置） */
function setBlockType(view: EditorView, nodeType: any, attrs?: Record<string, unknown>): void {
  const { $from } = view.state.selection;
  // $from.before() 在文档第一个顶层节点时会抛 "there is no position before the top-level node"，
  // 改用 $from.start() - 1 得到当前所在块节点的位置（语义等价但对首节点安全）
  const nodePos = $from.start($from.depth) - 1;
  view.dispatch(view.state.tr.setNodeMarkup(nodePos, nodeType, attrs).scrollIntoView());
  view.focus();
}

export function turnIntoHeading(view: EditorView, level: number): void {
  const t = view.state.schema.nodes.heading;
  if (t) setBlockType(view, t, { level });
}

export function wrapBulletList(view: EditorView): void {
  const t = view.state.schema.nodes.bullet_list;
  if (t) wrapBlock(view, t);
}

export function wrapOrderedList(view: EditorView): void {
  const t = view.state.schema.nodes.ordered_list;
  if (t) wrapBlock(view, t);
}

export function wrapBlockquote(view: EditorView): void {
  const t = view.state.schema.nodes.blockquote;
  if (t) wrapBlock(view, t);
}

export function turnIntoCodeBlock(view: EditorView): void {
  const t = view.state.schema.nodes.code_block;
  if (t) setBlockType(view, t, { language: "text" });
}

export function insertHr(view: EditorView): void {
  const t = view.state.schema.nodes.hr;
  if (t) insertNodeAfter(view, t.create());
}

export function insertMathBlock(view: EditorView): void {
  const t = view.state.schema.nodes.math_display;
  if (t) insertNodeAfter(view, t.create());
}

export function turnIntoMermaid(view: EditorView): void {
  const t = view.state.schema.nodes.code_block;
  if (t) setBlockType(view, t, { language: "mermaid" });
}

export function insertCallout(view: EditorView, calloutType: "note" | "warning" | "tip" | "important"): void {
  const schema = view.state.schema;
  if (!schema.nodes.callout) return;
  const callout = schema.nodes.callout.create(
    { calloutType },
    schema.nodes.paragraph.create(),
  );
  insertNodeAfter(view, callout);
}

export function insertToc(view: EditorView): void {
  const t = view.state.schema.nodes.toc;
  if (t) insertNodeAfter(view, t.create());
}

export function insertFrontmatter(view: EditorView): void {
  const schema = view.state.schema;
  if (!schema.nodes.frontmatter) return;
  // 文档已有 frontmatter 则跳过
  if (view.state.doc.firstChild?.type.name === "frontmatter") return;
  const fm = schema.nodes.frontmatter.create({ value: "title: \ndate: " });
  view.dispatch(view.state.tr.insert(0, fm).scrollIntoView());
  view.focus();
}
