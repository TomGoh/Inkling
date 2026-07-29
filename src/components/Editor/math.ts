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
// mhchem 扩展：让 KaTeX 支持 \ce{} \cee{} 等化学方程式语法（仅副作用引入）
// @ts-ignore - contrib 模块无类型声明
import "katex/dist/contrib/mhchem.js";

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
    // 公式自动编号：运行时由 formula-numbering 插件设置，不参与 markdown 序列化
    number: { default: null },
  },
  parseDOM: [
    {
      tag: "div[data-math-display]",
      getAttrs: (dom: HTMLElement) => ({
        value: dom.getAttribute("data-value") ?? dom.textContent ?? "",
        number: null,
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

    const render = (value: string, number: number | null) => {
      dom.setAttribute("data-value", value);
      // display 公式启用自动编号时追加 \tag{n}（用户手写 \tag 时不覆盖）
      let expr = value;
      if (displayMode && number != null && !/\\tag\b/.test(value)) {
        expr = `${value} \\tag{${number}}`;
      }
      try {
        dom.innerHTML = katex.renderToString(expr, {
          displayMode,
          throwOnError: false,
          output: "html",
        });
      } catch {
        dom.textContent = value;
      }
    };
    render(node.attrs.value as string, displayMode ? (node.attrs.number as number | null) : null);

    return {
      dom,
      update: (next: Node) => {
        if (
          next.type.name !== (displayMode ? "math_display" : "math_inline")
        ) {
          return false;
        }
        if (
          next.attrs.value === node.attrs.value &&
          next.attrs.number === node.attrs.number
        ) {
          return true;
        }
        render(
          next.attrs.value as string,
          displayMode ? (next.attrs.number as number | null) : null,
        );
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
