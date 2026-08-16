// workspace store 的组合类型定义
// 各 slice 接口在各自文件中声明，这里组合出完整 WorkspaceState，
// 对外（src/store/workspace.ts）保持原有的 useWorkspace / OpenTab 接口不变。

import type { FileTreeSlice } from "./fileTree";
import type { TabsSlice } from "./tabs";
import type { BookmarksSlice } from "./bookmarks";
import type { RecentsSlice } from "./recents";

/** 单个打开的标签页 */
export interface OpenTab {
  /** 文件完整路径（未命名草稿用 untitled-N 虚拟路径） */
  path: string;
  /** 文件内容 */
  content: string;
  /** 是否未保存 */
  dirty: boolean;
  /** 最近一次保存时间戳（ms），null 表示从未保存 */
  lastSavedAt: number | null;
  /** 编辑位置记忆：光标在文档中的偏移（null 表示未记录） */
  cursorPos: number | null;
  /** 编辑位置记忆：编辑器滚动条垂直偏移（null 表示未记录） */
  scrollTop: number | null;
  /** 未命名草稿：尚未保存到磁盘的新建文件，保存时弹另存为对话框 */
  isUntitled?: boolean;
  /** 该标签页是否处于源代码模式（issue #19） */
  sourceMode?: boolean;
}

/** 完整工作区状态：各领域 slice 的交集组合 */
export type WorkspaceState = FileTreeSlice & TabsSlice & BookmarksSlice & RecentsSlice;
