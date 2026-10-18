// 链接点击跟随（#298 重写：DOM 捕获层 → 分类器 → 动作分派）
//
// 为什么不再用 ProseMirror 的 handleClick：
// - html-view 渲染的原始 `<a>` 不在 mark 通路上（NodeView 无 contentDOM、stopEvent 恒 false），
//   handleClick 永远看不到它；而 #298 实测的危害正是「点一下 html 块里的链接，应用被导航走」。
// - 一个 capture 阶段 listener 能同时覆盖 link mark 与 html `<a>`，判定/执行各只写一份。
//
// 语义（与设计文档 §3 一致）：
// - 任何时候点中 `<a>` 都 `preventDefault()`（不变量：应用内永不发生浏览器导航）；
// - 裸点击 / 中键只阻断默认、不跟随；右键完全不拦；
// - Ctrl/Cmd + 左键才跟随：外链走系统浏览器、`#frag` 滚到标题、其余走提示。

import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { Node } from "@milkdown/kit/prose/model";
import { isTauri } from "@tauri-apps/api/core";
import { classifyLink } from "../../lib/link-target";
import { performLinkAction, type LinkNoticeKind } from "./link-actions";

const key = new PluginKey("inkling-link-click");

/**
 * GitHub 风格 slug：转小写、去标点、空格/下划线转连字符。
 * Unicode 感知（\p{L}\p{N}），中文等非 ASCII 字母保留。
 *
 * #298 不改规则：本批次只换入口，锚点匹配口径原样保留（#297 才换锚点表）。
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** 在文档中查找 slug 匹配的标题节点位置 */
function findHeadingPos(doc: Node, anchor: string): number | null {
  let result: number | null = null;
  doc.descendants((node, pos) => {
    if (node.type.name === "heading") {
      if (slugify(node.textContent) === anchor) {
        result = pos;
        return false; // 找到即停止遍历
      }
    }
    return true;
  });
  return result;
}

/** 外部链接：桌面端用 opener 打开系统默认浏览器，浏览器端用 window.open */
async function openExternal(href: string): Promise<void> {
  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(href);
  } else {
    window.open(href, "_blank", "noopener");
  }
}

/** 滚动编辑器视图到指定节点位置 */
function scrollToNode(view: EditorView, pos: number): void {
  const dom = view.nodeDOM(pos);
  if (dom instanceof HTMLElement) {
    dom.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

/**
 * 文档内锚点跳转。未命中返回 false（由动作分派保持静默）。
 * 匹配规则与 #298 之前完全一致：`slugify(fragment)` 与标题 `slugify(textContent)` 相等。
 */
function scrollToAnchorInView(view: EditorView, fragment: string): boolean {
  const anchor = slugify(fragment);
  if (!anchor) return false;
  const headingPos = findHeadingPos(view.state.doc, anchor);
  if (headingPos == null) return false;
  scrollToNode(view, headingPos);
  return true;
}

/**
 * DOM `href` 为空时的回落：从 link mark 的 `attrs.href` 取原始值（#298 / F5）。
 *
 * 上游 `sanitizeLinkHref` 会把 `file:` 等协议的 DOM href 抹成空串，但 mark attrs 保留原文；
 * 只读 `getAttribute("href")` 会把这些链接当成「没有 href」而漏掉提示。
 * html atom 没有 marks，因此该回落只对 link mark 生效（html 的相对 href 在渲染阶段已被丢弃）。
 */
function linkHrefFromMark(view: EditorView, event: MouseEvent): string {
  const hit = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!hit) return "";
  const mark = view.state.doc.resolve(hit.pos).marks().find((m) => m.type.name === "link");
  return ((mark?.attrs.href as string) ?? "").trim();
}

export interface LinkClickPluginOptions {
  /** 本编辑器实例的文档路径（主 / 分屏各一份；草稿为 untitled-N） */
  documentPath: string;
  /** 工作区根在点击时实时读取：工作区可能在编辑器挂载之后才打开 */
  workspaceRoot: () => string | null;
  /** 失败提示（Editor.tsx 的 LinkNotice） */
  notify: (message: string, kind: LinkNoticeKind) => void;
}

/** 捕获阶段的统一入口（导出仅便于单测按需调用，生产路径只经由插件注册） */
export function handleLinkClick(
  view: EditorView,
  event: MouseEvent,
  opts: LinkClickPluginOptions,
): void {
  // 中键（auxclick button 1）拦默认；右键（button 2）完全不插手
  if (event.type === "click" && event.button !== 0) return;
  if (event.type === "auxclick" && event.button !== 1) return;

  const target = event.target as Element | null;
  const anchor = target?.closest?.("a");
  if (!anchor) return;

  // 核心不变量：点中 <a> 就先阻断浏览器默认导航，再谈「跟随与否」。
  // 不能只在「有修饰键 / 有 href」分支里 preventDefault——被 sanitize 抹掉 href 的
  // `<a>` 与裸点击同样会触发导航，那正是 #298 要止血的路径。
  event.preventDefault();

  const href =
    (anchor.getAttribute("href") ?? "").trim() || linkHrefFromMark(view, event);
  if (!href) return;

  // D3：裸点击不跟随；中键即使带修饰键也不跟随（只阻断默认）
  const follow = event.type === "click" && (event.ctrlKey || event.metaKey);
  if (!follow) return;

  const cls = classifyLink(href, {
    documentPath: opts.documentPath,
    workspaceRoot: opts.workspaceRoot(),
  });
  performLinkAction(cls, {
    openExternal,
    notify: opts.notify,
    scrollToAnchor: (fragment) => scrollToAnchorInView(view, fragment),
  });
}

/**
 * 链接点击跟随插件（唯一入口）。
 *
 * 通过 `view()` 生命周期在 `view.dom` 上挂 capture 阶段 listener：
 * 先于 ProseMirror 的冒泡处理与 NodeView 内联 listener，且不需要改动任何 mark/node 结构。
 */
export const linkClickPlugin = (opts: LinkClickPluginOptions) =>
  new Plugin({
    key,
    view: (view) => {
      const onClick = (event: MouseEvent) => handleLinkClick(view, event, opts);
      view.dom.addEventListener("click", onClick, true);
      view.dom.addEventListener("auxclick", onClick, true);
      return {
        destroy: () => {
          view.dom.removeEventListener("click", onClick, true);
          view.dom.removeEventListener("auxclick", onClick, true);
        },
      };
    },
  });
