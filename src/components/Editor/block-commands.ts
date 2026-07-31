// 块级插入/转换命令：供工具栏按钮复用。
// 与斜杠菜单的插入逻辑等价，但不依赖 `/` 触发位置——直接在当前选区操作：
// - 转换类（标题/代码块/Mermaid）：把当前所在顶层块改为目标类型
// - 包裹类（列表/引用）：wrap 当前块
// - 插入类（分割线/公式/callout/TOC）：若当前段落为空则替换，否则插在当前块之后
// - frontmatter：插在文档首部

import type { EditorView } from "@milkdown/kit/prose/view";
import type { Node } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";

/** 包裹当前选区所在块为指定节点（引用：单层） */
function wrapBlock(view: EditorView, nodeType: any): void {
  const { $from, $to } = view.state.selection;
  const range = $from.blockRange($to);
  if (!range) return;
  view.dispatch(view.state.tr.wrap(range, [{ type: nodeType }]).scrollIntoView());
  view.focus();
}

/** 包裹当前选区所在块为列表：需同时包 list_item 层（list content 为 list_item+） */
function wrapListBlock(view: EditorView, listType: any): void {
  const schema = view.state.schema;
  const listItem = schema.nodes.list_item;
  if (!listType || !listItem) return;
  const { $from, $to } = view.state.selection;
  const range = $from.blockRange($to);
  if (!range) return;
  view.dispatch(
    view.state.tr.wrap(range, [{ type: listType }, { type: listItem }]).scrollIntoView(),
  );
  view.focus();
}

/**
 * 在当前光标处插入一个块节点：
 * - 当前段落为空：直接替换该段落，避免多出空行
 * - 否则：插到当前块之后
 */
function insertBlockHere(view: EditorView, node: Node): void {
  const { $from } = view.state.selection;
  const parent = $from.parent;
  if (parent.type.name === "paragraph" && parent.content.size === 0) {
    const start = $from.before($from.depth);
    view.dispatch(view.state.tr.replaceWith(start, start + parent.nodeSize, node).scrollIntoView());
  } else {
    const pos = $from.after($from.depth);
    view.dispatch(view.state.tr.insert(pos, node).scrollIntoView());
  }
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
  if (t) wrapListBlock(view, t);
}

export function wrapOrderedList(view: EditorView): void {
  const t = view.state.schema.nodes.ordered_list;
  if (t) wrapListBlock(view, t);
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
  if (t) insertBlockHere(view, t.create());
}

export function insertMathBlock(view: EditorView): void {
  const t = view.state.schema.nodes.math_display;
  if (t) insertBlockHere(view, t.create());
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
  insertBlockHere(view, callout);
}

export function insertToc(view: EditorView): void {
  const t = view.state.schema.nodes.toc;
  if (t) insertBlockHere(view, t.create());
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

/**
 * 删除光标所在的顶层块节点（引用/代码块/Mermaid/提示框/元数据/列表/公式/TOC/分割线等）。
 * - 定位到 depth=0 的块节点，整体删除
 * - 删除后若文档变空，补一个空段落避免无法编辑
 * - 光标移到被删块的前一块末尾（或新空段落）
 */
export function deleteCurrentBlock(view: EditorView): void {
  const { state } = view;
  const { $head } = state.selection;
  if ($head.depth === 0) {
    // 光标在文档顶层（极少见），直接在光标处删一个块
    return;
  }
  // 找到顶层块节点（depth=1 的父节点）
  const topPos = $head.before(1);
  const topNode = state.doc.nodeAt(topPos);
  if (!topNode) return;
  const end = topPos + topNode.nodeSize;
  let tr = state.tr.delete(topPos, end);
  // 文档变空时补一个空段落
  if (tr.doc.content.size === 0 || tr.doc.childCount === 0) {
    const para = state.schema.nodes.paragraph.create();
    tr = tr.insert(0, para);
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(1)));
  } else {
    // 光标移到删除位置附近的前一个块末尾
    const beforePos = Math.max(0, topPos - 1);
    try {
      const safe = Math.max(0, Math.min(beforePos, tr.doc.content.size));
      tr = tr.setSelection(TextSelection.near(tr.doc.resolve(safe)));
    } catch {
      // 忽略无效位置
    }
  }
  view.dispatch(tr.scrollIntoView());
  view.focus();
}
