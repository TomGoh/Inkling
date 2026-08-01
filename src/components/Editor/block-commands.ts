// 块级插入/转换命令：供工具栏按钮复用。
// 与斜杠菜单的插入逻辑等价，但不依赖 `/` 触发位置——直接在当前选区操作：
// - 转换类（标题/代码块/Mermaid）：把当前所在顶层块改为目标类型
// - 包裹类（列表/引用）：wrap 当前块
// - 插入类（分割线/公式/callout/TOC）：若当前段落为空则替换，否则插在当前块之后
// - frontmatter：插在文档首部

import type { EditorView } from "@milkdown/kit/prose/view";
import type { Node } from "@milkdown/kit/prose/model";
import { TextSelection, NodeSelection } from "@milkdown/kit/prose/state";

/** NodeSelection 选中 atom 节点（frontmatter/toc/hr/math）时返回 true */
function isAtomSelected(view: EditorView): boolean {
  const { selection } = view.state;
  return (
    selection instanceof NodeSelection &&
    Boolean((selection.node.type as unknown as { atom?: boolean }).atom)
  );
}

/** 包裹当前选区所在块为指定节点（引用：单层） */
function wrapBlock(view: EditorView, nodeType: any): void {
  // NodeSelection 选中 atom 节点（frontmatter/toc/hr/math）时不能 wrap（atom 无 content）
  if (isAtomSelected(view)) {
    view.focus();
    return;
  }
  const { $from, $to } = view.state.selection;
  const range = $from.blockRange($to);
  if (!range) return;
  // 代码块不能被 wrap 进 blockquote（content 不匹配）
  if (range.parent.type.name === "code_block") {
    view.focus();
    return;
  }
  try {
    view.dispatch(view.state.tr.wrap(range, [{ type: nodeType }]).scrollIntoView());
  } catch {
    // wrap 失败（content 不匹配等）时静默忽略，避免报错打断用户
  }
  view.focus();
}

/** 包裹当前选区所在块为列表：需同时包 list_item 层（list content 为 list_item+） */
function wrapListBlock(view: EditorView, listType: any): void {
  const listItem = view.state.schema.nodes.list_item;
  if (!listType || !listItem) return;
  // NodeSelection 选中 atom 节点（frontmatter/toc/hr/math）时不能 wrap（atom 无 content）
  if (isAtomSelected(view)) {
    view.focus();
    return;
  }
  const { $from, $to } = view.state.selection;
  const range = $from.blockRange($to);
  if (!range) return;
  // 已在列表内时不重复 wrap（避免 invalid content for node list_item）
  if (range.parent.type.name === "list_item") {
    view.focus();
    return;
  }
  // 代码块不能被 wrap 进 list_item（content 不匹配）
  if (range.parent.type.name === "code_block") {
    view.focus();
    return;
  }
  try {
    view.dispatch(
      view.state.tr.wrap(range, [{ type: listType }, { type: listItem }]).scrollIntoView(),
    );
  } catch {
    // wrap 失败（content 不匹配等）时静默忽略，避免报错打断用户
  }
  view.focus();
}

/**
 * 在当前光标处插入一个块节点：
 * - 当前段落为空：直接替换该段落，避免多出空行
 * - 否则：插到当前块之后（若已是文档最后一个块，用 insert 而非 after 避免越界）
 */
function insertBlockHere(view: EditorView, node: Node): void {
  const { $from } = view.state.selection;
  const parent = $from.parent;
  if (parent.type.name === "paragraph" && parent.content.size === 0) {
    const start = $from.before($from.depth);
    view.dispatch(view.state.tr.replaceWith(start, start + parent.nodeSize, node).scrollIntoView());
  } else {
    // after() 在文档最后一个顶层块时会抛 "there is no position after the top-level node"
    // 改用 tr.insert 附加到文档末尾（insert 对末尾位置安全）
    const docSize = view.state.doc.content.size;
    let pos: number;
    try {
      pos = $from.after($from.depth);
    } catch {
      pos = docSize;
    }
    // 若 after 返回的位置超出文档范围，夹到末尾
    pos = Math.min(pos, docSize);
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
  if (!t) return;
  // math_display 是 atom 节点，插入空值后 KaTeX 渲染空字符串无可见内容，
  // 用户看不到也不知道要双击编辑。这里插入后自动选中并触发编辑模式。
  const node = t.create();
  const { $from } = view.state.selection;
  const parent = $from.parent;
  let nodePos: number;
  if (parent.type.name === "paragraph" && parent.content.size === 0) {
    const start = $from.before($from.depth);
    view.dispatch(
      view.state.tr
        .replaceWith(start, start + parent.nodeSize, node)
        .scrollIntoView(),
    );
    nodePos = start;
  } else {
    const pos = $from.after($from.depth);
    view.dispatch(view.state.tr.insert(pos, node).scrollIntoView());
    nodePos = pos;
  }
  // 选中新插入的 atom 节点（NodeSelection），下一帧触发双击进入编辑模式
  // 下一帧是为了等 NodeView 完成 DOM 挂载
  requestAnimationFrame(() => {
    try {
      const sel = NodeSelection.create(view.state.doc, nodePos);
      view.dispatch(view.state.tr.setSelection(sel));
      const dom = view.nodeDOM(nodePos) as HTMLElement | null;
      if (dom) {
        dom.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      }
    } catch {
      // 位置无效时静默失败，不影响插入
    }
  });
  view.focus();
}

/**
 * 插入行内公式 math_inline 节点。
 * - 在当前光标处插入空 atom 行内节点
 * - 插入后自动选中（NodeSelection）并触发双击进入编辑模式
 * - 空值时 NodeView 显示占位提示
 */
export function insertInlineMath(view: EditorView): void {
  const t = view.state.schema.nodes.math_inline;
  if (!t) return;
  const node = t.create();
  const { from } = view.state.selection;
  // 行内节点直接 insert 在光标处（不替换段落）
  view.dispatch(view.state.tr.insert(from, node).scrollIntoView());
  // 下一帧选中并触发编辑模式
  requestAnimationFrame(() => {
    try {
      const sel = NodeSelection.create(view.state.doc, from);
      view.dispatch(view.state.tr.setSelection(sel));
      const dom = view.nodeDOM(from) as HTMLElement | null;
      if (dom) {
        dom.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      }
    } catch {
      // 位置无效时静默失败
    }
  });
  view.focus();
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
 * 从一个 DOM 元素向上查找，定位它所属的「顶层块节点」在文档中的位置与节点。
 *
 * 用于 deleteCurrentBlock 的 DOM 焦点回退路径：当 atom 节点内嵌的子编辑器
 * （如 frontmatter 的 CodeMirror）获得焦点时，ProseMirror 的 selection
 * 不一定是 NodeSelection（可能被 CodeMirror 的 focus/blur 周期冲掉），
 * 此时直接读 document.activeElement 更可靠。
 *
 * 仅返回 atom 类型的顶层块，避免误删普通段落（普通段落的删除走 TextSelection 路径）。
 */
function atomNodeFromDom(
  view: EditorView,
  el: HTMLElement,
): { pos: number; node: Node } | null {
  // 向上走直到 view.dom 的直接子节点（即某个顶层块的 DOM）
  let cur: HTMLElement | null = el;
  while (cur && cur.parentElement !== view.dom) {
    cur = cur.parentElement;
  }
  if (!cur) return null;
  // 用同级兄弟计数得到该块在顶层的孩子索引
  let idx = 0;
  let sib: Element | null = cur;
  while (sib && sib.previousElementSibling) {
    idx++;
    sib = sib.previousElementSibling;
  }
  const doc = view.state.doc;
  if (idx >= doc.childCount) return null;
  let pos = 0;
  for (let i = 0; i < idx; i++) {
    pos += doc.child(i).nodeSize;
  }
  const node = doc.child(idx);
  // 只对 atom 节点走 DOM 路径删除，普通块仍走 selection 路径
  if (!(node.type as unknown as { atom?: boolean }).atom) return null;
  return { pos, node };
}

/**
 * 删除光标所在的顶层块节点（引用/代码块/Mermaid/提示框/元数据/列表/公式/TOC/分割线等）。
 *
 * 定位逻辑（按优先级）：
 * 1. NodeSelection：直接拿选中的节点和位置（atom 节点如 frontmatter/toc/hr/math 被点击选中时）
 * 2. DOM 焦点回退：CodeMirror 等子编辑器获得焦点时，selection 可能不是 NodeSelection，
 *    读 document.activeElement 反查所属 atom 顶层块
 * 3. TextSelection：用 $head.before(depth) 找顶层块（depth=1 的父节点）
 *
 * 删除后：
 * - 文档变空时补一个空段落
 * - 光标移到被删块的前一块末尾（或新空段落）
 */
export function deleteCurrentBlock(view: EditorView): void {
  const { state } = view;
  let topPos = 0;
  let topNode: Node | null | undefined;

  if (state.selection instanceof NodeSelection) {
    // atom 节点被选中（frontmatter/toc/hr/math_display 等）
    topPos = state.selection.from;
    topNode = state.doc.nodeAt(topPos);
  } else {
    // DOM 焦点回退：frontmatter 的 CodeMirror 获得焦点时，ProseMirror 的
    // selection 可能仍是旧位置（被 cm.focus()/setNodeAttribute 事务冲掉），
    // 此时按 activeElement 反查最准，否则会把旧 selection 指向的块误删
    const active = document.activeElement as HTMLElement | null;
    if (active && view.dom.contains(active)) {
      const hit = atomNodeFromDom(view, active);
      if (hit) {
        topPos = hit.pos;
        topNode = hit.node;
      }
    }
    if (topNode == null) {
      const { $head } = state.selection;
      if ($head.depth === 0) {
        // 光标在文档顶层（极少见），无法定位块
        return;
      }
      // before(1) 返回当前所在顶层块的位置
      try {
        topPos = $head.before(1);
      } catch {
        return;
      }
      topNode = state.doc.nodeAt(topPos);
    }
  }

  if (!topNode) return;
  const end = topPos + topNode.nodeSize;
  let tr = state.tr.delete(topPos, end);

  // 文档变空时补一个空段落避免无法编辑
  if (tr.doc.content.size === 0 || tr.doc.childCount === 0) {
    const para = state.schema.nodes.paragraph.create();
    tr = tr.insert(0, para);
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(1)));
  } else {
    // 光标移到删除位置附近的前一个块末尾
    // topPos 是被删块的起始位置，topPos-1 是前一个块的末尾位置
    // 但若 topPos=0（删第一个块），topPos-1=-1 无效，改用 0 找下一个有效位置
    const target = Math.max(0, topPos - 1);
    const safe = Math.max(0, Math.min(target, tr.doc.content.size));
    try {
      // TextSelection.near 会找 safe 附近最近的有效文本位置（向后或向前）
      tr = tr.setSelection(TextSelection.near(tr.doc.resolve(safe), -1));
    } catch {
      // 忽略无效位置，光标留在文档开头
    }
  }
  view.dispatch(tr.scrollIntoView());
  view.focus();
}
