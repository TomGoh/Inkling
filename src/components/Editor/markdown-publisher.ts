// Markdown 源码发布插件
// 全文序列化防抖 150ms：避免每次按键都 O(n) 序列化整篇文档
// （万行文档输入掉帧主因之一，issue #31）。blur/销毁时立即 flush 保证不丢内容。

import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { Node } from "@milkdown/kit/prose/model";

export interface MarkdownPublisherDeps {
  /** 将当前 doc 序列化为 Markdown 源码 */
  serialize: (doc: Node) => string;
  getLastSynced: () => string;
  setLastSynced: (markdown: string) => void;
  onChange: (markdown: string) => void;
}

// 存活编辑器的 flush 注册表：保存路径在读取 store 前统一 flush，
// 避免防抖窗口内 Ctrl/Cmd+S 读到旧内容（PR #34 review）
const pendingFlushes = new Set<() => void>();

export function flushAllMarkdownPublishers(): void {
  for (const flush of [...pendingFlushes]) flush();
}

export function hasPendingMarkdownPublishers(): boolean {
  return pendingFlushes.size > 0;
}

export const markdownPublisherPlugin = (deps: MarkdownPublisherDeps) =>
  new Plugin({
    key: new PluginKey("inkling-markdown-publisher"),
    view: (view) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      // 打开文件时以「解析后 doc 的实际序列化结果」为基线，而非原始文件内容。
      // 否则编辑器初始化的首个 flush 会因序列化规范化差异（如末尾换行）把
      // 从未编辑的文档误判为变更、经 onChange 标 dirty，导致关闭 tab 时
      // 误弹未保存确认（E2E「关闭 tab」失败根因）。
      try {
        deps.setLastSynced(deps.serialize(view.state.doc));
      } catch {
        // 序列化失败保持原基线，flush 时再兜底
      }
      const flush = () => {
        // 无待发编辑（timer 为 null）直接跳过：保存路径的 flush 不应
        // 对每个挂载编辑器重跑全文序列化（万行文档的大停顿，PR #34）。
        // 注意不能再按源码模式跳过：源码模式下 PM doc 不会变化，
        // timer 非空必然意味着进入源码模式前的待发编辑，必须发布
        if (!timer) return;
        clearTimeout(timer);
        timer = null;
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
      pendingFlushes.add(flush);
      return {
        update: (nextView, prevState) => {
          if (nextView.state.doc === prevState.doc) return;
          if (timer) clearTimeout(timer);
          timer = setTimeout(flush, 150);
        },
        destroy: () => {
          pendingFlushes.delete(flush);
          view.dom.removeEventListener("blur", flush);
          flush();
        },
      };
    },
  });
