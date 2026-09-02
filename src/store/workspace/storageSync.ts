// workspace 持久化状态的跨窗口同步（issue #165）
//
// settings/theme/shortcuts 早已通过原生 `storage` 事件跨窗口同步，
// 但 workspace 域的最近文件/书签/展开目录只在启动时读一次、变更时整体覆写：
// 窗口 A 的新条目会被窗口 B 随后的整体覆写抹掉。
//
// 这里为这三个 key 注册 `storage` 事件监听：任一窗口写入后，其余窗口
// 立即从 localStorage 重读最新值更新内存状态。之后的写回基于已合并的
// 内存列表，消除"后写覆盖先写"的静默数据缺项。
//
// 注意：`storage` 事件只在「其他窗口」写入时触发（发起写入的窗口自身
// 内存已是最新），与 settings.ts 的既有模式一致。

import {
  BOOKMARKS_KEY,
  EXPANDED_DIRS_KEY,
  RECENT_FILES_KEY,
  loadBookmarks,
  loadExpandedDirs,
  loadRecentFiles,
} from "./shared";

/** 只允许同步这三个持久化状态字段 */
export interface WorkspaceStorageSyncPatch {
  recentFiles?: string[];
  bookmarks?: string[];
  expandedDirs?: Set<string>;
}

/**
 * 注册 workspace 持久化 key 的跨窗口同步监听。
 * 在 useWorkspace store 创建时调用一次（模块级单例）。
 */
export function subscribeWorkspaceStorageSync(
  set: (patch: WorkspaceStorageSyncPatch) => void,
): void {
  if (typeof window === "undefined") return;
  window.addEventListener("storage", (e: StorageEvent) => {
    // key 为 null 表示 localStorage.clear()：其他窗口整体清空属于异常路径，
    // 不主动抹掉本窗口内存状态，避免用户数据随他窗口的清空操作丢失。
    if (!e.key) return;
    if (e.key === RECENT_FILES_KEY) {
      set({ recentFiles: loadRecentFiles() });
    } else if (e.key === BOOKMARKS_KEY) {
      set({ bookmarks: loadBookmarks() });
    } else if (e.key === EXPANDED_DIRS_KEY) {
      set({ expandedDirs: loadExpandedDirs() });
    }
  });
}
