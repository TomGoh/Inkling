// Markdown 源码发布插件
// 全文序列化防抖 150ms：避免每次按键都 O(n) 序列化整篇文档
// （万行文档输入掉帧主因之一，issue #31）。blur/销毁时立即 flush 保证不丢内容。

import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { Node } from "@milkdown/kit/prose/model";

export interface MarkdownPublisherDeps {
  /** 将当前 doc 序列化为 Markdown 源码 */
  serialize: (doc: Node) => string;
  isSourceMode: () => boolean;
  getLastSynced: () => string;
  setLastSynced: (markdown: string) => void;
  onChange: (markdown: string) => void;
}

export const markdownPublisherPlugin = (deps: MarkdownPublisherDeps) =>
  new Plugin({
    key: new PluginKey("inkling-markdown-publisher"),
    view: (view) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const flush = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        if (deps.isSourceMode()) return;
        let markdown: string;
        try {
          markdown = deps.serialize(view.state.doc);
        } catch (e) {
          console.error("Markdown 序列化失败：", e);
          return;
        }
        // 编辑器内部产生的变更才回调；外部 value 同步进来的不回调
        if (markdown !== deps.getLastSynced()) {
          deps.setLastSynced(markdown);
          deps.onChange(markdown);
        }
      };
      view.dom.addEventListener("blur", flush);
      return {
        update: (nextView, prevState) => {
          if (nextView.state.doc === prevState.doc) return;
          if (timer) clearTimeout(timer);
          timer = setTimeout(flush, 150);
        },
        destroy: () => {
          view.dom.removeEventListener("blur", flush);
          flush();
        },
      };
    },
  });
