// 选区跟踪插件：光标进入/离开表格时通过回调通知外部，
// 供 App.tsx 的表格工具栏切换上下文按钮组。
// 去重状态存放在外部传入的 inTableRef：组件在进入源码模式时
// 会重置该 ref，保证回到 WYSIWYG 后首次 update 重新同步。
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { findParentNodeClosestToPos } from "@milkdown/kit/prose";

export function tableTrackerPlugin(
  inTableRef: { current: boolean },
  onChange: (inTable: boolean) => void,
) {
  return new Plugin({
    key: new PluginKey("inkling-table-tracker"),
    view: () => ({
      update: (view) => {
        const found = findParentNodeClosestToPos(
          (n) => n.type.name === "table",
        )(view.state.selection.$head);
        const next = !!found;
        if (next !== inTableRef.current) {
          inTableRef.current = next;
          onChange(next);
        }
      },
    }),
  });
}
