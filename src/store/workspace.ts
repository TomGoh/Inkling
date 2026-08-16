// 工作区状态管理（按领域拆分为 Zustand slice，见 ./workspace/ 目录）
// 当前打开的工作区（文件夹）、文件树、多标签页编辑
// currentFile / currentContent / dirty 等始终是「活跃 tab」的镜像，
// 切换 tab 时同步更新，保持下游组件接口不变。
//
// slice 划分（issue #49）：
// - workspace/fileTree.ts —— 工作区上下文 + 文件树按需加载 + 展开/书签等持久化同步
// - workspace/tabs.ts —— 标签页、活跃文档镜像、分屏、保存与读取状态
// - workspace/bookmarks.ts —— 书签
// - workspace/recents.ts —— 最近打开文件
// - workspace/shared.ts —— 跨 slice 共享的持久化 / 路径工具 / 操作序号
// 对外接口（useWorkspace / OpenTab）与拆分前完全一致。

import { create } from "zustand";
import { createFileTreeSlice } from "./workspace/fileTree";
import { createTabsSlice } from "./workspace/tabs";
import { createBookmarksSlice } from "./workspace/bookmarks";
import { createRecentsSlice } from "./workspace/recents";
import type { WorkspaceState } from "./workspace/types";

export type { OpenTab, WorkspaceState } from "./workspace/types";

export const useWorkspace = create<WorkspaceState>()((...a) => ({
  ...createFileTreeSlice(...a),
  ...createTabsSlice(...a),
  ...createBookmarksSlice(...a),
  ...createRecentsSlice(...a),
}));
