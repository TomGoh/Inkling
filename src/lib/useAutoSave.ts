// 保存逻辑：Ctrl/Cmd+S 手动保存 + dirty 变化后防抖 2 秒自动保存

import { useEffect } from "react";
import { flushAllMarkdownPublishers } from "../components/Editor/markdown-publisher";
import { useWorkspace } from "../store/workspace";

const AUTOSAVE_DEBOUNCE_MS = 2000;

/**
 * 挂载后监听：
 * - 全局 Ctrl/Cmd+S 键盘事件 → 立即保存
 * - dirty 变为 true 后 2 秒仍 dirty → 自动保存（未命名草稿除外）
 */
export function useAutoSave() {
  const dirty = useWorkspace((s) => s.dirty);
  const saving = useWorkspace((s) => s.saving);
  const currentFile = useWorkspace((s) => s.currentFile);
  // 只订阅「活跃 tab 是否未命名」这一布尔派生值，避免 openTabs 因 content 变化时重订阅 effect
  const activeTabIsUntitled = useWorkspace((s) => {
    const tab = s.openTabs.find((t) => t.path === s.activeTabPath);
    return tab?.isUntitled ?? false;
  });
  const saveCurrent = useWorkspace((s) => s.saveCurrent);

  // 手动保存快捷键
  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      // 排除 Alt/Shift，避免与 Ctrl/Cmd+Alt+S（源代码模式）等组合键冲突
        if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "s") {
          e.preventDefault();
          // 先 flush 防抖窗口内的序列化，再保存，否则可能保存旧内容
          flushAllMarkdownPublishers();
          void saveCurrent();
        }
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [saveCurrent]);

  // 自动保存：dirty 且非保存中且非未命名草稿时，防抖 2 秒触发
  useEffect(() => {
    if (!dirty || saving || !currentFile) return;
    if (activeTabIsUntitled) return;
    const timer = window.setTimeout(() => {
      // 脏状态可能来自上一次保存；定时器到点时最新编辑或仍在防抖窗口内，
      // 与手动保存同样先 flush，避免保存旧内容（PR #34 review）
      flushAllMarkdownPublishers();
      void saveCurrent();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [dirty, saving, currentFile, activeTabIsUntitled, saveCurrent]);
}
