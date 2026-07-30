// [TOC] 目录自动生成
// 用户在文档中写一行 `[TOC]`（或 `{:toc}`），自动渲染为当前文档标题的目录树。
// markdown 源码保持 `[TOC]` 原文，渲染内容由 NodeView 根据文档实时计算，
// 标题增删/修改时目录自动更新，无需用户手动维护。
// 点击目录项跳转到对应标题。

import { $nodeSchema, $remark, $view } from "@milkdown/kit/utils";
import type { NodeView, NodeViewConstructor } from "@milkdown/kit/prose/view";
import type { Node } from "@milkdown/kit/prose/model";
import type { EditorView as PMView } from "@milkdown/kit/prose/view";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { slugify } from "./link-click";

/**
 * toc 块节点：仅作为占位，渲染内容由 NodeView 根据文档动态生成。
 * parseMarkdown 只匹配经 remark 插件转换后的 mdast `toc` 节点。
 */
export const tocSchema = $nodeSchema("toc", () => ({
  group: "block",
  atom: true,
  marks: "",
  selectable: true,
  draggable: false,
  defining: true,
  isolating: true,
  attrs: {},
  parseDOM: [{ tag: "div[data-toc]" }],
  toDOM: () => ["div", { class: "toc-block", "data-toc": "" }],
  parseMarkdown: {
    match: (node) => node.type === "toc",
    runner: (state, _node, type) => {
      state.addNode(type, {});
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "toc",
    runner: (state, _node) => {
      // 序列化回 `[TOC]` 占位段落，保持源码可移植
      state.addNode("paragraph", undefined, "[TOC]");
    },
  },
}));

export const tocKey = new PluginKey("inkling-toc");

/**
 * remark 插件：把「整段只有 [TOC] 或 {:toc}」的段落转换为 mdast 的 toc 节点。
 * milkdown 在解析 markdown 后会跑所有 remark 插件，转换后的 toc 节点再走 parseMarkdown。
 */
function remarkTocTransformer() {
  return (tree: { children?: unknown[] }) => {
    if (!tree || !Array.isArray(tree.children)) return;
    const next = tree.children.map((child) => {
      if (typeof child !== "object" || child === null) return child;
      const c = child as { type?: string; children?: { type?: string; value?: string }[] };
      if (c.type !== "paragraph") return child;
      const text = (c.children || [])
        .map((cc) => (cc?.type === "text" ? cc.value ?? "" : ""))
        .join("")
        .trim();
      if (/^\[TOC\]$/i.test(text) || /^\{:toc\}$/i.test(text)) {
        return { type: "toc", children: [] };
      }
      return child;
    });
    (tree as { children: unknown[] }).children = next;
  };
}

/** 注册 remark 插件 */
export const remarkTocPlugin = $remark("remarkToc", () => remarkTocTransformer);

interface TocItem {
  level: number;
  text: string;
  id: string;
}

/** 收集文档中所有标题 */
function collectHeadings(doc: Node): TocItem[] {
  const items: TocItem[] = [];
  let index = 0;
  doc.descendants((node) => {
    if (node.type.name !== "heading") return true;
    const level = node.attrs.level as number;
    if (level < 1 || level > 6) return true;
    const text = node.textContent.trim();
    if (!text) return true;
    const id =
      (node.attrs.id as string | undefined) || `toc-${index}-${slugify(text)}`;
    items.push({ level, text, id });
    index++;
    return true;
  });
  return items;
}

/** 跳转到匹配的标题节点 */
function scrollToHeading(view: PMView, id: string, slugFallback: string): void {
  let targetPos: number | null = null;
  view.state.doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return true;
    const nodeId = (node.attrs.id as string | undefined) ?? "";
    if (nodeId === id || slugify(node.textContent) === slugFallback) {
      targetPos = pos;
      return false;
    }
    return true;
  });
  if (targetPos == null) return;
  const dom = view.nodeDOM(targetPos);
  if (dom instanceof HTMLElement) {
    dom.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

interface TocViewExt {
  _tocListHost?: HTMLElement;
  _tocEmpty?: HTMLElement;
}

/** toc 节点视图：根据文档标题实时渲染目录列表 */
function createTocView(): NodeViewConstructor {
  return (_node: Node, view: PMView): NodeView => {
    const dom = document.createElement("div") as HTMLElement & TocViewExt;
    dom.className = "toc-block";
    dom.setAttribute("data-toc", "");

    const label = document.createElement("div");
    label.className = "toc-label";
    label.textContent = "目录";
    dom.appendChild(label);

    const listHost = document.createElement("ul");
    listHost.className = "toc-list";
    dom.appendChild(listHost);
    dom._tocListHost = listHost;

    const renderList = () => {
      const items = collectHeadings(view.state.doc);
      // 清空 listHost
      while (listHost.firstChild) listHost.removeChild(listHost.firstChild);
      // 若上一次渲染了 empty，先恢复 listHost
      if (dom._tocEmpty && dom._tocEmpty.parentElement === dom) {
        dom.replaceChild(listHost, dom._tocEmpty);
        dom._tocEmpty = undefined;
      }
      if (items.length === 0) {
        const empty = document.createElement("p");
        empty.className = "toc-empty";
        empty.textContent = "（文档暂无标题，目录为空）";
        dom.replaceChild(empty, listHost);
        dom._tocEmpty = empty;
        return;
      }
      for (const item of items) {
        const li = document.createElement("li");
        li.className = "toc-item";
        li.style.paddingLeft = `${(item.level - 1) * 1.2}rem`;
        const a = document.createElement("a");
        a.textContent = item.text;
        a.href = "#";
        a.title = item.text;
        a.addEventListener("click", (e) => {
          e.preventDefault();
          scrollToHeading(view, item.id, slugify(item.text));
        });
        li.appendChild(a);
        listHost.appendChild(li);
      }
    };

    renderList();

    return {
      dom,
      ignoreMutation: () => true,
      // 允许鼠标点击事件冒泡到链接处理，键盘事件由 ProseMirror 处理
      stopEvent: (e) => !(e instanceof MouseEvent),
      update: () => {
        // 文档变化时重渲染目录
        renderList();
        return true;
      },
      destroy: () => {},
    };
  };
}

/** toc 节点视图注册 */
export const tocView = $view(tocSchema.node, () => createTocView());

/**
 * toc ProseMirror 插件：留作扩展点。
 * ProseMirror 在文档变化时会自动检查所有 NodeView 并触发其 update 回调，
 * 因此 toc NodeView.update 会在标题增删/修改时被自动调用并重渲染目录，
 * 此插件本身当前不需要做任何事。
 */
export const tocPlugin = () =>
  new Plugin({
    key: tocKey,
  });
