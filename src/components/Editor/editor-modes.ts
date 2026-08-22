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
        const isFocus = useSettings.getState().focusMode;
        const $head = state.selection.$head;
        if ($head.depth < 1) return DecorationSet.empty;
        const top = $head.node(1);
        const start = $head.before(1);

        const classes = ["inkling-current-block"];
        if (isFocus) {
          classes.push("inkling-focused");
        }

        return DecorationSet.create(state.doc, [
          Decoration.node(start, start + top.nodeSize, {
            class: classes.join(" "),
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
