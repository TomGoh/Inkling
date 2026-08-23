// 源码模式大纲与滚动跳转注册表
// 供大纲面板（OutlinePanel）在源码模式下调度光标定位与平滑滚动。

import type { EditorOutlineHeading } from "./outline";

export interface SourceModeScrollHandler {
  /** 滚动并聚焦到指定大纲标题所在行 */
  scrollToHeading: (heading: EditorOutlineHeading) => void;
  /** 获取当前 CodeMirror 编辑器的滚动位置和选区 */
  getScrollAndCursor?: () => { scrollTop: number; cursor: number };
}

const registry = new Map<string, SourceModeScrollHandler>();

/** 注册特定文档路径的源码模式滚动处理器 */
export function registerSourceModeScroll(
  filePath: string,
  handler: SourceModeScrollHandler,
) {
  registry.set(filePath, handler);
}

/** 取消注册特定文档路径的源码模式滚动处理器 */
export function unregisterSourceModeScroll(filePath: string) {
  registry.delete(filePath);
}

/** 在源码模式下滚动到指定大纲标题 */
export function runSourceModeScrollToHeading(
  filePath: string,
  heading: EditorOutlineHeading,
): boolean {
  const handler = registry.get(filePath);
  if (!handler) return false;
  handler.scrollToHeading(heading);
  return true;
}
