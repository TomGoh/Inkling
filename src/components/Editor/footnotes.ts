// 脚注支持
// GFM 预设已通过 remark-gfm 解析脚注语法并注册 footnote_reference / footnote_definition
// 两种节点 schema（见 @milkdown/preset-gfm 的 node/footnote）。
// 本文件只覆盖默认 NodeView，提供更好的视觉呈现和交互：
//   - footnote_reference 渲染为 [^label] 上标，点击跳转到对应定义
//   - footnote_definition 渲染为带标签和返回链接的块，点击返回首个引用
// markdown 源码保持标准 GFM 脚注语法（[^1] 与 [^1]: 内容），可被 GitHub 等直接消费。

import { $view } from "@milkdown/kit/utils";
import type { NodeView, NodeViewConstructor } from "@milkdown/kit/prose/view";
import type { Node } from "@milkdown/kit/prose/model";
import type { EditorView as PMView } from "@milkdown/kit/prose/view";
import {
  footnoteReferenceSchema,
  footnoteDefinitionSchema,
} from "@milkdown/kit/preset/gfm";

/** 在文档中查找指定 label 的 footnote_definition 节点位置 */
function findFootnoteDefPos(doc: Node, label: string): number | null {
  let result: number | null = null;
  doc.descendants((node, pos) => {
    if (node.type.name !== "footnote_definition") return true;
    if ((node.attrs.label as string) === label) {
      result = pos;
      return false;
    }
    return true;
  });
  return result;
}

/** 在文档中查找指定 label 的首个 footnote_reference 节点位置 */
function findFirstFootnoteRefPos(doc: Node, label: string): number | null {
  let result: number | null = null;
  doc.descendants((node, pos) => {
    if (result != null) return false;
    if (node.type.name !== "footnote_reference") return true;
    if ((node.attrs.label as string) === label) {
      result = pos;
      return false;
    }
    return true;
  });
  return result;
}

/** 滚动到指定 ProseMirror 节点位置 */
function scrollNodeIntoView(view: PMView, pos: number): void {
  const dom = view.nodeDOM(pos);
  if (dom instanceof HTMLElement) {
    dom.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

/**
 * footnote_reference 节点视图：渲染为 [^label] 上标，点击跳转到定义。
 * label 通常是数字 1/2/3...，但也支持任意标识符。
 */
function createFootnoteRefView(): NodeViewConstructor {
  return (node: Node, view: PMView): NodeView => {
    const label = (node.attrs.label as string) ?? "";
    const dom = document.createElement("sup");
    dom.className = "footnote-ref";
    dom.setAttribute("data-label", label);

    const a = document.createElement("a");
    a.href = "#";
    a.textContent = label;
    a.title = `跳转到脚注 ${label}`;
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const pos = findFootnoteDefPos(view.state.doc, label);
      if (pos != null) scrollNodeIntoView(view, pos);
    });
    dom.appendChild(a);

    return {
      dom,
      ignoreMutation: () => true,
      stopEvent: (e) => e instanceof MouseEvent,
      update: (next: Node) => {
        if (next.type.name !== "footnote_reference") return false;
        const newLabel = (next.attrs.label as string) ?? "";
        if (newLabel === label) return true;
        // label 变化时重建整个视图（罕见情况）
        return false;
      },
      destroy: () => {},
    };
  };
}

/**
 * footnote_definition 节点视图：渲染为「[label]: 内容 ↩」格式。
 * 内容部分仍由 ProseMirror 默认渲染（content hole），保证可编辑。
 * 末尾追加返回链接，点击跳转到首个引用位置。
 */
function createFootnoteDefView(): NodeViewConstructor {
  return (node: Node, view: PMView): NodeView => {
    const label = (node.attrs.label as string) ?? "";

    const dom = document.createElement("div");
    dom.className = "footnote-definition";
    dom.setAttribute("data-label", label);

    // 标签行：[label]:
    const head = document.createElement("span");
    head.className = "footnote-label";
    head.textContent = label;
    dom.appendChild(head);

    // 内容容器：ProseMirror 会把节点内容渲染到这里
    const content = document.createElement("div");
    content.className = "footnote-content";
    dom.appendChild(content);

    // 返回链接
    const back = document.createElement("a");
    back.className = "footnote-backref";
    back.href = "#";
    back.title = "返回引用位置";
    back.addEventListener("click", (e) => {
      e.preventDefault();
      const pos = findFirstFootnoteRefPos(view.state.doc, label);
      if (pos != null) scrollNodeIntoView(view, pos);
    });
    dom.appendChild(back);

    return {
      dom,
      contentDOM: content,
      ignoreMutation: () => false,
      stopEvent: (e) => e instanceof MouseEvent && e.target === back,
      update: (next: Node) => {
        if (next.type.name !== "footnote_definition") return false;
        const newLabel = (next.attrs.label as string) ?? "";
        if (newLabel === label) return true;
        return false;
      },
      destroy: () => {},
    };
  };
}

/** footnote_reference 自定义视图注册 */
export const footnoteRefView = $view(footnoteReferenceSchema.node, () =>
  createFootnoteRefView(),
);

/** footnote_definition 自定义视图注册 */
export const footnoteDefinitionView = $view(
  footnoteDefinitionSchema.node,
  () => createFootnoteDefView(),
);
