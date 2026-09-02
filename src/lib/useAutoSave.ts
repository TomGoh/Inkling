// 保存逻辑：Ctrl/Cmd+S 手动保存 + dirty 变化后防抖自动保存（支持连续失败指数退避与非阻塞模式）

import { useEffect, useRef, useState } from "react";
import { flushAllMarkdownPublishers } from "../components/Editor/markdown-publisher";
import { useWorkspace } from "../store/workspace";

const BASE_AUTOSAVE_DEBOUNCE_MS = 2000;
const MAX_AUTOSAVE_DEBOUNCE_MS = 60000;

/**
 * 挂载后监听：
 * - 全局 Ctrl/Cmd+S 键盘事件 → 立即保存
 * - dirty 变为 true 后防抖自动保存（未命名草稿除外；支持连续失败指数退避 2s -> 4s -> 8s... -> 60s；非阻塞静默跳过冲突）
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

  // 连续失败次数计数器
  const failCountRef = useRef(0);
  // saveCurrent toggles `saving` back to false before this hook can inspect
  // saveError. Bump a revision after updating failCount so the effect replaces
  // the prematurely scheduled base-delay timer with the correct backoff timer.
  const [retryRevision, setRetryRevision] = useState(0);

  // 手动保存快捷键
  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      // 排除 Alt/Shift，避免与 Ctrl/Cmd+Alt+S（源代码模式）等组合键冲突
      if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        // 先 flush 防抖窗口内的序列化，再保存，否则可能保存旧内容
        flushAllMarkdownPublishers();
        void saveCurrent({ interactive: true });
      }
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [saveCurrent]);

  // 自动保存：dirty 且非保存中且非未命名草稿时，防抖触发（指数退避）
  useEffect(() => {
    if (!dirty || saving || !currentFile) return;
    if (activeTabIsUntitled) return;

    // 指数退避：failCount = 0 -> 2s, failCount = 1 -> 4s, failCount = 2 -> 8s... 最大 60s
    const delay = failCountRef.current === 0
      ? BASE_AUTOSAVE_DEBOUNCE_MS
      : Math.min(MAX_AUTOSAVE_DEBOUNCE_MS, BASE_AUTOSAVE_DEBOUNCE_MS * Math.pow(2, failCountRef.current));

    const timer = window.setTimeout(async () => {
      // 脏状态可能来自上一次保存；定时器到点时最新编辑或仍在防抖窗口内，
      // 与手动保存同样先 flush，避免保存旧内容（PR #34 review）
      flushAllMarkdownPublishers();
      try {
        await saveCurrent({ interactive: false });
        const state = useWorkspace.getState();
        if (!state.dirty && !state.saveError) {
          failCountRef.current = 0;
        } else if (state.saveError) {
          failCountRef.current = Math.min(failCountRef.current + 1, 6);
          setRetryRevision((revision) => revision + 1);
        }
      } catch {
        failCountRef.current = Math.min(failCountRef.current + 1, 6);
        setRetryRevision((revision) => revision + 1);
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [dirty, saving, currentFile, activeTabIsUntitled, saveCurrent, retryRevision]);
}
