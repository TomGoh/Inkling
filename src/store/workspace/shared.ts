// workspace 各 slice 共享的模块级工具：
// localStorage 持久化读写、路径工具、防过期覆盖的操作序号与请求去重表。
// 这些不是响应式状态，保留模块级单例语义（跨 slice 共享同一份数据）。

import { isPathWithin } from "../../lib/fileTree";

/** 最近打开文件列表的持久化 key */
const RECENT_FILES_KEY = "inkling-recent-files";
const RECENT_FILES_MAX = 10;

/** 读取持久化的最近文件列表 */
export function loadRecentFiles(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_FILES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as string[];
    return Array.isArray(arr) ? arr.slice(0, RECENT_FILES_MAX) : [];
  } catch {
    return [];
  }
}

/** 持久化最近文件列表 */
export function persistRecentFiles(files: string[]): void {
  try {
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(files.slice(0, RECENT_FILES_MAX)));
  } catch {
    // 忽略写入失败
  }
}

/** 展开目录列表的持久化 key（未记录的目录默认折叠） */
const EXPANDED_DIRS_KEY = "inkling-expanded-dirs-v2";

/** 读取持久化的展开目录列表 */
export function loadExpandedDirs(): Set<string> {
  try {
    const raw = localStorage.getItem(EXPANDED_DIRS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

/** 持久化展开目录列表 */
export function persistExpandedDirs(dirs: Set<string>): void {
  try {
    localStorage.setItem(EXPANDED_DIRS_KEY, JSON.stringify([...dirs]));
  } catch {
    // 忽略写入失败
  }
}

/** 书签列表的持久化 key */
const BOOKMARKS_KEY = "inkling-bookmarks";

/** 读取持久化的书签列表 */
export function loadBookmarks(): string[] {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as string[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** 持久化书签列表 */
export function persistBookmarks(files: string[]): void {
  try {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(files));
  } catch {
    // 忽略写入失败
  }
}

/** 把 path 推到列表头部并去重，截断到最大长度 */
export function pushRecent(list: string[], path: string): string[] {
  const next = [path, ...list.filter((p) => p !== path)];
  return next.slice(0, RECENT_FILES_MAX);
}

/** 取文件所在目录路径（兼容 / 与 \），根目录则返回原路径 */
export function parentDir(filePath: string): string {
  const idx = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  if (idx < 0) return filePath;
  const sep = filePath[idx];
  if (idx === 0) return sep;
  if (idx === 2 && /^[a-zA-Z]:[\\/]/.test(filePath)) return filePath.slice(0, 2) + sep;
  return filePath.slice(0, idx);
}

/** 把目录重命名前缀同步到持久化路径 */
export function rebasePathPrefix(path: string, from: string, to: string): string {
  return isPathWithin(path, from) ? to + path.slice(from.length) : path;
}

/**
 * 跨 slice 共享的操作序号（live-binding：ES 模块导入不可赋值，收敛为对象属性）：
 * - workspaceGeneration：工作区切换序号，较旧的异步结果不得覆盖后来打开的工作区
 * - mainFile：主面板文件选择序号，较旧的读取结果可以加入 tab，但不得抢回活跃状态
 * - splitFile：分屏文件选择序号，连续打开时只允许最后一次操作更新分屏
 * - workspaceContext：文件夹与单文件模式只接受最后一次切换结果
 */
export const intents = {
  workspaceGeneration: 0,
  mainFile: 0,
  splitFile: 0,
  workspaceContext: 0,
};

/** 同一目录的并发请求复用同一个 Promise，避免重复枚举 */
export const directoryRequests = new Map<string, Promise<void>>();

/** 加载中的目录发生文件变更时，合并为一次后续强制刷新 */
export const forcedDirectoryRequests = new Map<string, Promise<void>>();

/** 同一文件的并发读取复用一个 Promise，避免重复读取和重复创建 tab */
export const fileRequests = new Map<string, Promise<string>>();
