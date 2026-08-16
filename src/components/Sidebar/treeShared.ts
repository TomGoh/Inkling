// Sidebar 内部共享的常量、类型与纯函数
// 文件树与右键菜单之间通过自定义事件通信，避免 props 层层透传。

import type { FileNode } from "../../lib/fs";

/** 判断是否为 Markdown 文件 */
export function isMarkdown(name: string): boolean {
  return /\.(md|markdown)$/i.test(name);
}

/** 取文件名（路径最后一段） */
export function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

/** 取父目录路径 */
export function dirname(p: string): string {
  const idx = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
  if (idx < 0) return "";
  if (idx === 0) return p.slice(0, 1);
  if (idx === 2 && /^[a-zA-Z]:[\\/]/.test(p)) return p.slice(0, 3);
  return p.slice(0, idx);
}

/** 自定义事件名 */
export const TREE_MENU_EVENT = "inkling-tree-menu";
export const TREE_ACTION_EVENT = "inkling-tree-action";

/** 右键菜单传给 Sidebar 的载荷 */
export interface MenuPayload {
  node: FileNode;
  x: number;
  y: number;
}

/** Sidebar 指令文件树执行的动作 */
export type TreeAction =
  | { type: "rename"; node: FileNode }
  | { type: "new"; parentPath: string; kind: "file" | "dir" };

/** 新建项的输入框状态 */
export interface NewItemState {
  parentPath: string;
  kind: "file" | "dir";
}

/** 文件树固定行高与视口外预渲染行数 */
export const TREE_ROW_HEIGHT = 28;
export const TREE_OVERSCAN = 8;
export const TREE_FALLBACK_HEIGHT = 560;

/** 窗口化文件树中的一行 */
export type FileTreeRow =
  | { kind: "node"; node: FileNode; depth: number }
  | { kind: "new"; parentPath: string; itemKind: "file" | "dir"; depth: number }
  | { kind: "loading"; path: string; depth: number }
  | { kind: "error"; path: string; message: string; depth: number };
