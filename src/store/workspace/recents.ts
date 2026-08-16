// workspace slice：最近打开文件
// 状态本身只有列表；写入点分散在 tabs（激活/保存草稿）与
// fileTree（重命名/删除同步）中，持久化逻辑在 shared.ts。

import type { StateCreator } from "zustand";
import { loadRecentFiles } from "./shared";
import type { WorkspaceState } from "./types";

/** 最近打开文件 slice */
export interface RecentsSlice {
  /** 最近打开的文件路径列表（最多 10 个，最新在前） */
  recentFiles: string[];
}

export const createRecentsSlice: StateCreator<
  WorkspaceState,
  [],
  [],
  RecentsSlice
> = () => ({
  recentFiles: loadRecentFiles(),
});
