// 编辑器模式插件：专注模式 + 打字机模式
// 专注模式：给当前光标所在块节点加 inkling-focused 装饰，CSS 弱化其余块
// 打字机模式：选区变化时滚动，使当前行保持在滚动容器垂直居中
// 两者均通过 useSettings 运行时读取，开关切换由 Editor dispatch 空 tr 触发重算

import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { useSettings } from "../../store/settings";

export const editorModesKey = new PluginKey("inkling-editor-modes");

export const editorModesPlugin = () =>
  new Plugin({
    key: editorModesKey,
    state: {
      init: () => ({}),
      apply: () => ({}),
    },
    props: {
      decorations: (state) => {
        if (!useSettings.getState().focusMode) return DecorationSet.empty;
        const $head = state.selection.$head;
        // 取光标所在的「文档顶层块」（即 .ProseMirror 直接子节点，深度 1）挂装饰，
        // 与 App.css 的高亮粒度一致（.focus-mode .ProseMirror > .inkling-focused）。
        // 若取最内层块（findParentNodeClosestToPos(n => n.isBlock)），列表/表格等
        // 复合块只会命中内部段落，而外层列表/表格仍被整体弱化（issue #56）。
        if ($head.depth < 1) return DecorationSet.empty;
        const top = $head.node(1);
        const start = $head.before(1);
        return DecorationSet.create(state.doc, [
          Decoration.node(start, start + top.nodeSize, {
            class: "inkling-focused",
          }),
        ]);
      },
    },
    view: () => ({
      update: (view, prevState) => {
        if (!useSettings.getState().typewriterMode) return;
        const sel = view.state.selection;
        // 仅在选区或文档变化时滚动
        if (sel.eq(prevState.selection) && prevState.doc.eq(view.state.doc)) return;
        try {
          const coords = view.coordsAtPos(sel.head);
          const scroller = view.dom.closest(".editor-scroll") as HTMLElement | null;
          if (!scroller) return;
          const rect = scroller.getBoundingClientRect();
          const lineH = coords.bottom - coords.top;
          const offset = coords.top - rect.top - rect.height / 2 + lineH / 2;
          if (Math.abs(offset) > 1) scroller.scrollBy({ top: offset });
        } catch {
          // 位置不可达时忽略
        }
      },
    }),
  });
