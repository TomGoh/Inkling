// 大纲当前标题跟踪插件
// 从 ProseMirror 视图发布渲染标题及当前标题，供主编辑器大纲面板使用。

import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import {
  extractEditorOutline,
  findActiveHeadingIndex,
  type EditorOutlineSnapshot,
} from "../../lib/outline";

const key = new PluginKey("inkling-outline-tracker");
const VIEWPORT_HEADING_OFFSET = 12;

/** 根据编辑区视口顶部附近的位置查找当前阅读章节。 */
function findViewportHeadingIndex(
  view: EditorView,
  headings: EditorOutlineSnapshot["headings"],
  scroller: HTMLElement,
): number | null | undefined {
  const scrollerRect = scroller.getBoundingClientRect();
  if (
    scrollerRect.bottom <= scrollerRect.top ||
    scrollerRect.right <= scrollerRect.left
  ) {
    return undefined;
  }

  const editorRect = view.dom.getBoundingClientRect();
  const visibleLeft = Math.max(scrollerRect.left + 1, editorRect.left + 1);
  const visibleRight = Math.min(scrollerRect.right - 1, editorRect.right - 1);
  const visibleTop = Math.max(scrollerRect.top + 1, editorRect.top + 1);
  const visibleBottom = Math.min(
    scrollerRect.bottom - 1,
    editorRect.bottom - 1,
  );
  if (visibleRight < visibleLeft || visibleBottom < visibleTop) {
    return undefined;
  }

  const left = Math.max(
    visibleLeft,
    Math.min(editorRect.left + 16, visibleRight),
  );
  const top = Math.max(
    visibleTop,
    Math.min(scrollerRect.top + VIEWPORT_HEADING_OFFSET, visibleBottom),
  );
  const viewportPos = view.posAtCoords({ left, top });
  return viewportPos
    ? findActiveHeadingIndex(headings, viewportPos.pos)
    : undefined;
}

export const outlineTrackerPlugin = (
  onChange: (snapshot: EditorOutlineSnapshot) => void,
) =>
  new Plugin({
    key,
    view: (view) => {
      let headings = extractEditorOutline(view.state.doc);
      let activeIndex = findActiveHeadingIndex(
        headings,
        view.state.selection.head,
      );
      let scrollFrame: number | null = null;
      const scroller = view.dom.closest<HTMLElement>(".editor-scroll");

      onChange({ headings, activeIndex });

      // ProseMirror 不会为纯滚动产生 transaction，因此单独从视口位置
      // 更新阅读章节；按动画帧合并，避免长文档滚动时反复强制布局。
      const handleScroll = () => {
        if (!scroller || scrollFrame != null) return;
        scrollFrame = requestAnimationFrame(() => {
          scrollFrame = null;
          if (!view.dom.isConnected) return;
          const nextActiveIndex = findViewportHeadingIndex(
            view,
            headings,
            scroller,
          );
          // 布局切换或编辑器内边距可能令 posAtCoords 暂时无法采样；
          // 此时保留当前章节，避免正常的小幅滚动让高亮闪烁消失。
          if (
            nextActiveIndex === undefined ||
            nextActiveIndex === activeIndex
          ) {
            return;
          }
          activeIndex = nextActiveIndex;
          onChange({ headings, activeIndex });
        });
      };
      scroller?.addEventListener("scroll", handleScroll, { passive: true });

      return {
        update: (nextView, previousState) => {
          const docChanged = nextView.state.doc !== previousState.doc;
          const selectionChanged = !nextView.state.selection.eq(
            previousState.selection,
          );
          const nextHeadings = docChanged
            ? extractEditorOutline(nextView.state.doc)
            : headings;
          const nextActiveIndex =
            docChanged || selectionChanged
              ? findActiveHeadingIndex(
                  nextHeadings,
                  nextView.state.selection.head,
                )
              : activeIndex;

          if (docChanged || nextActiveIndex !== activeIndex) {
            headings = nextHeadings;
            activeIndex = nextActiveIndex;
            onChange({ headings, activeIndex });
          }
        },
        destroy: () => {
          scroller?.removeEventListener("scroll", handleScroll);
          if (scrollFrame != null) cancelAnimationFrame(scrollFrame);
        },
      };
    },
  });
