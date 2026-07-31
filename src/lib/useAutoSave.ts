// 保存逻辑：Ctrl/Cmd+S 手动保存 + dirty 变化后防抖 2 秒自动保存

import { useEffect } from "react";
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
  const activeTabPath = useWorkspace((s) => s.activeTabPath);
  const openTabs = useWorkspace((s) => s.openTabs);
  const saveCurrent = useWorkspace((s) => s.saveCurrent);

  // 手动保存快捷键
  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveCurrent();
      }
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [saveCurrent]);

  // 自动保存：dirty 且非保存中且非未命名草稿时，防抖 2 秒触发
  useEffect(() => {
    if (!dirty || saving || !currentFile) return;
    // 未命名草稿不自动保存（无磁盘文件，需手动 Ctrl+S 触发另存为对话框）
    const activeTab = openTabs.find((t) => t.path === activeTabPath);
    if (activeTab?.isUntitled) return;
    const timer = window.setTimeout(() => {
      void saveCurrent();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [dirty, saving, currentFile, activeTabPath, openTabs, saveCurrent]);
}
