// 大纲当前标题跟踪插件
// 从 ProseMirror 视图发布渲染标题及当前标题，供主编辑器大纲面板使用。
//
// 性能（v2.3.3）：滚动路径不再用 posAtCoords 采样视口位置——它需要
// 线性扫描文档级子节点的 rect，在数十万像素高的万行文档上单次耗时
// 50ms+，是引用块区域滚动掉帧的主因（v2.1.0 无大纲面板故无此开销）。
// 改为缓存各标题元素在滚动坐标系中的位置（批量读取一次布局），
// 滚动采样只做 scrollTop 与缓存数组的二分比较，纯数值运算微秒级。
// 缓存在文档变更后防抖重建；采样时若滚动总高/宽度变化（图表渲染、
// 窗口缩放、布局切换）也会触发重建。

import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import {
  extractEditorOutline,
  findActiveHeadingIndex,
  type EditorOutlineSnapshot,
} from "../../lib/outline";

const key = new PluginKey("inkling-outline-tracker");
/** 视口顶部的采样偏移：标题顶端滚过视口顶该距离即视为当前章节 */
const VIEWPORT_HEADING_OFFSET = 12;
/** 滚动采样节流间隔：目录高亮延迟 120ms 人眼不可辨 */
const SAMPLE_MIN_INTERVAL_MS = 120;

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
      let sampleTimer: ReturnType<typeof setTimeout> | null = null;
      let lastSampleAt = 0;
      // 编辑时全文遍历提取标题开销大（万行文档每键 O(n)），防抖到输入停顿后
      let extractTimer: ReturnType<typeof setTimeout> | null = null;
      const scroller = view.dom.closest<HTMLElement>(".editor-scroll");

      // ---- 标题位置缓存（滚动坐标系） ----
      let headingTops: number[] = [];
      let builtScrollHeight = -1;
      let builtClientWidth = -1;

      /** 批量重建标题位置缓存：所有 rect 在同一帧内读取，只触发一次布局 */
      const rebuildHeadingTops = () => {
        if (!scroller) {
          headingTops = [];
          builtScrollHeight = -1;
          builtClientWidth = -1;
          return;
        }
        const scrollerRect = scroller.getBoundingClientRect();
        // viewport 坐标 → 滚动内容坐标的换算基点
        const base = scroller.scrollTop - scrollerRect.top;
        headingTops = headings.map((h) => {
          const dom = view.nodeDOM(h.pos);
          const el =
            dom instanceof Element ? dom : (dom?.parentElement ?? null);
          if (!el || !el.isConnected) return Number.POSITIVE_INFINITY;
          return base + el.getBoundingClientRect().top;
        });
        builtScrollHeight = scroller.scrollHeight;
        builtClientWidth = scroller.clientWidth;
      };

      onChange({ headings, activeIndex });

      const sampleViewport = () => {
        lastSampleAt = performance.now();
        if (!view.dom.isConnected || !scroller) return;
        // 缓存失效检测：文档变更重建后数量不一致，或滚动总高/宽度变化
        //（图表后台渲染、窗口缩放、布局列切换）令位置整体偏移
        if (
          headingTops.length !== headings.length ||
          scroller.scrollHeight !== builtScrollHeight ||
          scroller.clientWidth !== builtClientWidth
        ) {
          rebuildHeadingTops();
        }
        if (headingTops.length === 0) return;
        // 二分找最后一个 top <= scrollTop + offset 的标题（升序保证）
        const probe = scroller.scrollTop + VIEWPORT_HEADING_OFFSET;
        let lo = 0;
        let hi = headingTops.length - 1;
        let idx = -1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (headingTops[mid] <= probe) {
            idx = mid;
            lo = mid + 1;
          } else {
            hi = mid - 1;
          }
        }
        const next = idx >= 0 ? headings[idx].index : null;
        if (next === activeIndex) return;
        activeIndex = next;
        onChange({ headings, activeIndex });
      };

      // ProseMirror 不会为纯滚动产生 transaction，因此单独从视口位置
      // 更新阅读章节；按动画帧合并 + 时间节流，采样本身只做数值比较。
      const handleScroll = () => {
        if (!scroller || scrollFrame != null) return;
        scrollFrame = requestAnimationFrame(() => {
          scrollFrame = null;
          const elapsed = performance.now() - lastSampleAt;
          if (elapsed >= SAMPLE_MIN_INTERVAL_MS) {
            sampleViewport();
            return;
          }
          // 节流窗口内：安排一次尾随采样，保证停止滚动后高亮收敛
          if (sampleTimer == null) {
            sampleTimer = setTimeout(
              () => {
                sampleTimer = null;
                sampleViewport();
              },
              SAMPLE_MIN_INTERVAL_MS - elapsed,
            );
          }
        });
      };
      scroller?.addEventListener("scroll", handleScroll, { passive: true });

      return {
        update: (nextView, previousState) => {
          const docChanged = nextView.state.doc !== previousState.doc;
          const selectionChanged = !nextView.state.selection.eq(
            previousState.selection,
          );

          if (docChanged) {
            // 标题集合防抖重算；重算时顺带按最新选区校正当前章节并重建位置缓存
            if (extractTimer) clearTimeout(extractTimer);
            extractTimer = setTimeout(() => {
              extractTimer = null;
              if (!view.dom.isConnected) return;
              headings = extractEditorOutline(view.state.doc);
              activeIndex = findActiveHeadingIndex(
                headings,
                view.state.selection.head,
              );
              rebuildHeadingTops();
              onChange({ headings, activeIndex });
            }, 150);
            return;
          }

          if (selectionChanged) {
            const nextActiveIndex = findActiveHeadingIndex(
              headings,
              nextView.state.selection.head,
            );
            if (nextActiveIndex !== activeIndex) {
              activeIndex = nextActiveIndex;
              onChange({ headings, activeIndex });
            }
          }
        },
        destroy: () => {
          scroller?.removeEventListener("scroll", handleScroll);
          if (scrollFrame != null) cancelAnimationFrame(scrollFrame);
          if (sampleTimer) clearTimeout(sampleTimer);
          if (extractTimer) clearTimeout(extractTimer);
        },
      };
    },
  });
