// KaTeX 数学公式节点
// 行内公式 $...$ 和块级公式 $$...$$ 通过 remark-math 解析为 mdast 节点，
// 再映射到 ProseMirror 的 atom 节点，渲染交给 KaTeX NodeView。
// markdown 源码保持原始 LaTeX 文本（$...$ / $$...$$），便于迁移。

import { $nodeSchema, $remark, $view } from "@milkdown/kit/utils";
import type { NodeView, NodeViewConstructor } from "@milkdown/kit/prose/view";
import type { Node } from "@milkdown/kit/prose/model";
import remarkMath from "remark-math";
import katex from "katex";
import "katex/dist/katex.min.css";

/**
 * 行内数学节点 math_inline
 * 对应 remark-math 的 mdast 节点 { type: "inlineMath", value }
 */
export const mathInlineSchema = $nodeSchema("math_inline", () => ({
  inline: true,
  group: "inline",
  atom: true,
  marks: "",
  selectable: true,
  draggable: false,
  defining: true,
  attrs: {
    value: { default: "", validate: "string" },
  },
  parseDOM: [
    {
      tag: "span[data-math-inline]",
      getAttrs: (dom: HTMLElement) => ({
        value: dom.getAttribute("data-value") ?? dom.textContent ?? "",
      }),
    },
  ],
  toDOM: (node: Node) => [
    "span",
    {
      class: "math-inline",
      "data-math-inline": "",
      "data-value": node.attrs.value as string,
    },
    node.attrs.value as string,
  ],
  parseMarkdown: {
    match: (node) => node.type === "inlineMath",
    runner: (state, node, type) => {
      state.addNode(type, { value: (node.value as string) ?? "" });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "math_inline",
    runner: (state, node) => {
      state.addNode("inlineMath", undefined, node.attrs.value as string);
    },
  },
}));

/**
 * 块级显示数学节点 math_display
 * 对应 remark-math 的 mdast 节点 { type: "math", value }
 */
export const mathDisplaySchema = $nodeSchema("math_display", () => ({
  group: "block",
  atom: true,
  marks: "",
  selectable: true,
  defining: true,
  attrs: {
    value: { default: "", validate: "string" },
  },
  parseDOM: [
    {
      tag: "div[data-math-display]",
      getAttrs: (dom: HTMLElement) => ({
        value: dom.getAttribute("data-value") ?? dom.textContent ?? "",
      }),
    },
  ],
  toDOM: (node: Node) => [
    "div",
    {
      class: "math-display",
      "data-math-display": "",
      "data-value": node.attrs.value as string,
    },
    node.attrs.value as string,
  ],
  parseMarkdown: {
    match: (node) => node.type === "math",
    runner: (state, node, type) => {
      state.addNode(type, { value: (node.value as string) ?? "" });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "math_display",
    runner: (state, node) => {
      state.addNode("math", undefined, node.attrs.value as string);
    },
  },
}));

/** 注册 remark-math：产生 inlineMath / math mdast 节点 */
export const remarkMathPlugin = $remark("remarkMath", () => remarkMath);

/** 用 KaTeX 渲染数学节点的 NodeView 工厂 */
function createMathView(displayMode: boolean): NodeViewConstructor {
  return (node: Node): NodeView => {
    const dom = document.createElement(displayMode ? "div" : "span");
    dom.className = displayMode ? "math-display" : "math-inline";
    dom.setAttribute(displayMode ? "data-math-display" : "data-math-inline", "");

    const render = (value: string) => {
      dom.setAttribute("data-value", value);
      try {
        dom.innerHTML = katex.renderToString(value, {
          displayMode,
          throwOnError: false,
          output: "html",
        });
      } catch {
        dom.textContent = value;
      }
    };
    render(node.attrs.value as string);

    return {
      dom,
      update: (next: Node) => {
        if (
          next.type.name !== (displayMode ? "math_display" : "math_inline")
        ) {
          return false;
        }
        if (next.attrs.value === node.attrs.value) return true;
        render(next.attrs.value as string);
        return true;
      },
      stopEvent: () => true,
      ignoreMutation: () => true,
    };
  };
}

export const mathInlineView = $view(mathInlineSchema.node, () =>
  createMathView(false),
);
export const mathDisplayView = $view(mathDisplaySchema.node, () =>
  createMathView(true),
);
