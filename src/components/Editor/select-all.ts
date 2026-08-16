// Ctrl/Cmd+A 全选整个文档（ProseMirror 默认 Mod-a 只选当前块文本）
import { Plugin, PluginKey, AllSelection } from "@milkdown/kit/prose/state";

export function selectAllPlugin() {
  return new Plugin({
    key: new PluginKey("inkling-select-all"),
    props: {
      handleKeyDown: (view, event) => {
        const mod = event.ctrlKey || event.metaKey;
        if (!mod || event.shiftKey || event.altKey) return false;
        if (event.key.toLowerCase() !== "a") return false;
        const { state } = view;
        const sel = new AllSelection(state.doc);
        if (!state.selection.eq(sel)) {
          view.dispatch(state.tr.setSelection(sel).scrollIntoView());
        }
        event.preventDefault();
        return true;
      },
    },
  });
}
