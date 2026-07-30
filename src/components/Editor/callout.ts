// callout 提示框
// 支持 GFM 风格的 callout 语法：
//   > [!NOTE]
//   > 内容
//   > [!WARNING]
//   > 内容
//   > [!TIP]
//   > 内容
//   > [!IMPORTANT]
//   > 内容
// remark 插件识别 blockquote 首行的 [!TYPE] 标记，转换为 callout 节点；
// 渲染时根据 type 应用不同图标和配色；序列化时还原为 `> [!TYPE]` 语法。
// 普通 blockquote（无 [!TYPE] 标记）不受影响，仍走 commonmark 的 blockquote。

import { $nodeSchema, $remark, $view } from "@milkdown/kit/utils";
import type { NodeView, NodeViewConstructor } from "@milkdown/kit/prose/view";
import type { Node } from "@milkdown/kit/prose/model";
import type { EditorView as PMView } from "@milkdown/kit/prose/view";

/** 支持的 callout 类型 */
export type CalloutType = "note" | "warning" | "tip" | "important";

/** 类型元数据：图标 + 标题 + CSS class */
const CALLOUT_META: Record<CalloutType, { icon: string; title: string; cls: string }> = {
  note: { icon: "ℹ️", title: "注意", cls: "callout-note" },
  warning: { icon: "⚠️", title: "警告", cls: "callout-warning" },
  tip: { icon: "💡", title: "技巧", cls: "callout-tip" },
  important: { icon: "❗", title: "重要", cls: "callout-important" },
};

/** 把字符串规范化为 callout 类型，无法识别时返回 null */
function parseCalloutType(raw: string): CalloutType | null {
  const t = raw.trim().toLowerCase();
  if (t === "note" || t === "info") return "note";
  if (t === "warning" || t === "caution") return "warning";
  if (t === "tip" || t === "hint") return "tip";
  if (t === "important") return "important";
  return null;
}

/**
 * callout 块节点。
 * - group: block
 * - content: block+（允许内部放任意块，如段落、列表、代码块）
 * - isolating: true，避免回车时 callout 标记被破坏
 */
export const calloutSchema = $nodeSchema("callout", () => ({
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,
  attrs: {
    calloutType: { default: "note", validate: "string" },
  },
  parseDOM: [
    {
      tag: "div[data-callout]",
      getAttrs: (dom: HTMLElement) => ({
        calloutType: (dom.getAttribute("data-callout-type") ?? "note") as CalloutType,
      }),
    },
  ],
  toDOM: (node: Node) => {
    const t = (node.attrs.calloutType as CalloutType) ?? "note";
    const meta = CALLOUT_META[t] ?? CALLOUT_META.note;
    return [
      "div",
      {
        class: `callout-block ${meta.cls}`,
        "data-callout": "",
        "data-callout-type": t,
      },
      0,
    ];
  },
  parseMarkdown: {
    match: (node) => node.type === "callout",
    runner: (state, node, type) => {
      const t = parseCalloutType((node.calloutType as string) ?? "note") ?? "note";
      state.openNode(type, { calloutType: t });
      state.next(node.children);
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "callout",
    runner: (state, node) => {
      const t = (node.attrs.calloutType as CalloutType) ?? "note";
      const upper = t.charAt(0).toUpperCase() + t.slice(1);
      // 用 blockquote + 首行 [!TYPE] 语法序列化
      state.openNode("blockquote", undefined, { calloutType: upper });
      // 先插一个段落放 [!TYPE] 标记
      state.openNode("paragraph");
      state.addNode("text", undefined, `[!${upper}]`);
      state.closeNode();
      // 再把 callout 内的子节点原样写入
      state.next(node.content);
      state.closeNode();
    },
  },
}));

/**
 * remark 插件：识别 blockquote 首行的 [!TYPE] 标记，转为 callout 节点。
 * 仅当 blockquote 的第一个子节点（段落）文本完全匹配 [!TYPE] 时转换，
 * 否则保持原 blockquote 不变。
 */
function remarkCalloutTransformer() {
  return (tree: { children?: unknown[] }) => {
    if (!tree || !Array.isArray(tree.children)) return;
    tree.children = tree.children.map((child) => {
      if (typeof child !== "object" || child === null) return child;
      const c = child as { type?: string; children?: unknown[] };
      if (c.type !== "blockquote" || !Array.isArray(c.children)) return child;
      const first = c.children[0] as
        | { type?: string; children?: { type?: string; value?: string }[] }
        | undefined;
      if (!first || first.type !== "paragraph" || !Array.isArray(first.children)) {
        return child;
      }
      const text = first.children
        .map((cc) => (cc?.type === "text" ? cc.value ?? "" : ""))
        .join("")
        .trim();
      const m = /^\[!(\w+)\]$/.exec(text);
      if (!m) return child;
      const t = parseCalloutType(m[1]);
      if (!t) return child;
      // 去掉首段（[!TYPE] 标记段），保留其余子节点
      const rest = c.children.slice(1);
      return {
        type: "callout",
        calloutType: t,
        children: rest.length > 0 ? rest : [{ type: "paragraph", children: [] }],
      };
    });
  };
}

export const remarkCalloutPlugin = $remark("remarkCallout", () => remarkCalloutTransformer);

/** callout 节点视图：渲染带图标和标题的提示框 */
function createCalloutView(): NodeViewConstructor {
  return (node: Node, _view: PMView): NodeView => {
    const t = (node.attrs.calloutType as CalloutType) ?? "note";
    const meta = CALLOUT_META[t] ?? CALLOUT_META.note;

    const dom = document.createElement("div");
    dom.className = `callout-block ${meta.cls}`;
    dom.setAttribute("data-callout", "");
    dom.setAttribute("data-callout-type", t);

    const header = document.createElement("div");
    header.className = "callout-header";
    header.contentEditable = "false";

    const icon = document.createElement("span");
    icon.className = "callout-icon";
    icon.textContent = meta.icon;

    const title = document.createElement("span");
    title.className = "callout-title";
    title.textContent = meta.title;

    header.appendChild(icon);
    header.appendChild(title);
    dom.appendChild(header);

    // 内容容器：ProseMirror 会把子节点渲染到这里
    const content = document.createElement("div");
    content.className = "callout-content";
    dom.appendChild(content);

    return {
      dom,
      contentDOM: content,
      // calloutType 变化时更新头部
      update: (newNode: Node) => {
        if (newNode.type !== node.type) return false;
        const newT = (newNode.attrs.calloutType as CalloutType) ?? "note";
        if (newT === t) return true;
        const newMeta = CALLOUT_META[newT] ?? CALLOUT_META.note;
        dom.className = `callout-block ${newMeta.cls}`;
        dom.setAttribute("data-callout-type", newT);
        icon.textContent = newMeta.icon;
        title.textContent = newMeta.title;
        return true;
      },
      ignoreMutation: (m) => {
        // 头部非 contentDOM 的变更忽略
        if (m.type === "attributes") return true;
        return false;
      },
    };
  };
}

export const calloutView = $view(calloutSchema.node, () => createCalloutView());
