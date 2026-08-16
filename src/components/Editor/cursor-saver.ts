// 编辑位置记忆插件：选区/滚动变化时缓存到本地，
// 防抖 300ms、失焦或销毁时再落 store，避免每次光标移动都
// 写 openTabs 触发 TabsBar 等订阅组件重渲染。
// 落盘绑定 filePath：destroy flush 时 activeTabPath 可能已切
// 到新 tab，写活跃 tab 会把旧文件状态串写过去（issue #30）。
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

export function cursorSaverPlugin(
  filePath: string,
  getSaveCursorState: () => (path: string, pos: number, scrollTop: number) => void,
) {
  return new Plugin({
    key: new PluginKey("inkling-cursor-saver"),
    view: (view: EditorView) => {
      let lastPos = -1;
      let timer: ReturnType<typeof setTimeout> | null = null;
      // scrollTop 用 passive 监听缓存：每个 transaction 直接读
      // scrollTop 会在万行文档下每次按键强制同步布局
      const scrollEl =
        (view as EditorView & { scrollDOM?: HTMLElement }).scrollDOM ??
        view.dom.closest<HTMLElement>(".editor-scroll");
      let cachedScrollTop = scrollEl ? scrollEl.scrollTop : 0;
      const flush = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        if (lastPos < 0) return;
        getSaveCursorState()(filePath, lastPos, cachedScrollTop);
      };
      const schedule = (pos: number) => {
        lastPos = pos;
        if (timer) clearTimeout(timer);
        timer = setTimeout(flush, 300);
      };
      const onScroll = () => {
        cachedScrollTop = scrollEl ? scrollEl.scrollTop : 0;
        // 纯滚动不产生 transaction，补记一次，
        // 否则滚动后切 tab 会丢失阅读进度
        schedule(view.state.selection.head);
      };
      scrollEl?.addEventListener("scroll", onScroll, { passive: true });
      // 失焦立即落盘
      view.dom.addEventListener("blur", flush);
      return {
        update: (nextView) => {
          schedule(nextView.state.selection.head);
        },
        destroy: () => {
          flush();
          scrollEl?.removeEventListener("scroll", onScroll);
          view.dom.removeEventListener("blur", flush);
        },
      };
    },
  });
}
