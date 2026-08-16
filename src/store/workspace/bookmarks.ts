// workspace slice：书签
// 文件右键加入书签，侧边栏书签区块列出所有书签，点击跳转（重启保留）。

import type { StateCreator } from "zustand";
import { loadBookmarks, persistBookmarks } from "./shared";
import type { WorkspaceState } from "./types";

/** 书签 slice */
export interface BookmarksSlice {
  /** 书签文件路径列表 */
  bookmarks: string[];
  /** 切换书签状态（已收藏则取消，未收藏则添加） */
  toggleBookmark: (path: string) => void;
  /** 查询是否已收藏 */
  isBookmarked: (path: string) => boolean;
}

export const createBookmarksSlice: StateCreator<
  WorkspaceState,
  [],
  [],
  BookmarksSlice
> = (set, get) => ({
  bookmarks: loadBookmarks(),

  toggleBookmark: (path) => {
    const next = get().bookmarks.includes(path)
      ? get().bookmarks.filter((p) => p !== path)
      : [...get().bookmarks, path];
    set({ bookmarks: next });
    persistBookmarks(next);
  },

  isBookmarked: (path) => get().bookmarks.includes(path),
});
