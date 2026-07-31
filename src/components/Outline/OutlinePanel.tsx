// 大纲面板
// 解析当前文档的标题，生成可点击的目录树。
// 点击标题 → 滚动编辑器到对应标题位置。
// 当前光标所在标题高亮（由 outline-tracker 插件更新 store）。

import { useMemo } from "react";
import type { Editor } from "@milkdown/kit/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { TextSelection } from "@milkdown/kit/prose/state";
import { parseOutline, slugify } from "../../lib/outline";
import { useWorkspace } from "../../store/workspace";
import "./OutlinePanel.css";

interface OutlinePanelProps {
  /** 获取 Milkdown 编辑器实例，用于滚动定位 */
  getEditor: () => Editor | undefined;
}

const OUTLINE_SCROLL_DURATION = 280;
const outlineScrollFrames = new WeakMap<HTMLElement, number>();

/** 用固定时长的缓动滚动，避免原生 smooth 在长文档中耗时过长 */
function animateScrollTo(scroller: HTMLElement, targetTop: number) {
  const activeFrame = outlineScrollFrames.get(scroller);
  if (activeFrame != null) cancelAnimationFrame(activeFrame);

  const startTop = scroller.scrollTop;
  const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const endTop = Math.max(0, Math.min(targetTop, maxTop));
  const distance = endTop - startTop;

  if (
    Math.abs(distance) < 1 ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    scroller.scrollTop = endTop;
    outlineScrollFrames.delete(scroller);
    return;
  }

  const startTime = performance.now();
  const step = (now: number) => {
    if (!scroller.isConnected) {
      outlineScrollFrames.delete(scroller);
      return;
    }

    const progress = Math.min((now - startTime) / OUTLINE_SCROLL_DURATION, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    scroller.scrollTop = startTop + distance * eased;

    if (progress < 1) {
      const frame = requestAnimationFrame(step);
      outlineScrollFrames.set(scroller, frame);
    } else {
      scroller.scrollTop = endTop;
      outlineScrollFrames.delete(scroller);
    }
  };

  const frame = requestAnimationFrame(step);
  outlineScrollFrames.set(scroller, frame);
}

/** 滚动编辑器到第 occurrence 个 slug 匹配的标题节点 */
function scrollToHeading(
  getEditor: () => Editor | undefined,
  slug: string,
  occurrence: number,
) {
  const editor = getEditor();
  if (!editor) return;
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const doc = view.state.doc;
    let foundPos: number | null = null;
    let matched = 0;
    doc.descendants((node, pos) => {
      if (foundPos != null) return false;
      if (node.type.name === "heading") {
        if (slugify(node.textContent) === slug) {
          if (matched === occurrence) {
            foundPos = pos;
            return false;
          }
          matched++;
        }
      }
      return true;
    });
    const targetPos = foundPos;
    if (targetPos != null) {
      // 先更新选区并聚焦。若先启动 smooth scroll，ProseMirror 会在选区
      // 更新时恢复旧滚动位置，导致第一次点击的滚动被抵消。
      const sel = TextSelection.near(doc.resolve(targetPos + 1));
      view.dispatch(view.state.tr.setSelection(sel));
      view.focus();

      // 等选区、焦点及相关 React 状态完成布局后，再滚动实际的编辑区容器。
      requestAnimationFrame(() => {
        if (!view.dom.isConnected) return;
        const dom = view.nodeDOM(targetPos);
        const scroller = view.dom.closest<HTMLElement>(".editor-scroll");
        if (!(dom instanceof HTMLElement) || !scroller) return;

        const targetRect = dom.getBoundingClientRect();
        const scrollerRect = scroller.getBoundingClientRect();
        const toolbar =
          view.dom
            .closest<HTMLElement>(".md-editor-root")
            ?.querySelector<HTMLElement>(".table-toolbar") ?? null;
        const topOffset = (toolbar?.getBoundingClientRect().height ?? 0) + 8;
        const targetTop =
          scroller.scrollTop + targetRect.top - scrollerRect.top - topOffset;
        animateScrollTo(scroller, targetTop);
      });
    }
  });
}

export function OutlinePanel({ getEditor }: OutlinePanelProps) {
  const currentContent = useWorkspace((s) => s.currentContent);
  const currentHeadingSlug = useWorkspace((s) => s.currentHeadingSlug);

  const headings = useMemo(
    () => parseOutline(currentContent),
    [currentContent],
  );
  const slugOccurrences = new Map<string, number>();

  return (
    <aside className="outline-panel">
      <div className="outline-header">
        <span className="outline-title">大纲</span>
      </div>
      <div className="outline-tree">
        {headings.length === 0 ? (
          <div className="outline-empty">文档暂无标题</div>
        ) : (
          headings.map((h) => {
            const slug = slugify(h.text);
            const occurrence = slugOccurrences.get(slug) ?? 0;
            slugOccurrences.set(slug, occurrence + 1);
            const active = slug === currentHeadingSlug;
            return (
              <button
                key={h.id}
                className={`outline-item outline-h${h.level}${active ? " outline-item-active" : ""}`}
                style={{ paddingLeft: `${(h.level - 1) * 12 + 8}px` }}
                title={h.text}
                onClick={() => scrollToHeading(getEditor, slug, occurrence)}
              >
                <span className="outline-item-text">{h.text}</span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}

export default OutlinePanel;
