// 源码模式大纲与滚动跳转注册表
// 供大纲面板（OutlinePanel）在源码模式下调度光标定位与平滑滚动。

import type { EditorOutlineHeading } from "./outline";

export interface SourceModeScrollSnapshot {
  scrollTop: number;
  cursor: number;
  scrollHeight: number;
  /** 视口顶部可见行的 markdown 偏移（内容锚点，#136）：密度不均时比例映射会
   *  指向不同内容，锚定「视口顶部是哪段内容」才能跨容器保持一致阅读位置 */
  anchorOffset: number;
  /** 光标所在行是否位于视口内（#136）：仅当用户在源码模式「看着光标」时，
   *  退出恢复才做光标可见性微调；光标在视口外（只滚动未点击的陈旧光标）
   *  时强行拽视口会覆盖锚点映射结果、造成往返漂移 */
  cursorVisible: boolean;
}

export interface SourceModeScrollHandler {
  /** 滚动并聚焦到指定大纲标题所在行 */
  scrollToHeading: (heading: EditorOutlineHeading) => void;
  /** 获取当前 CodeMirror 编辑器的滚动位置、选区、容器总高度与视口顶部内容锚点 */
  getScrollAndCursor?: () => SourceModeScrollSnapshot;
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

/** 在源码模式下获取当前编辑器的滚动位置与光标 */
export function getSourceModeScroll(filePath: string): SourceModeScrollSnapshot | null {
  const handler = registry.get(filePath);
  if (!handler || !handler.getScrollAndCursor) return null;
  return handler.getScrollAndCursor();
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
