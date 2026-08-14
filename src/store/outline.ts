// 大纲快照 store
// 主编辑器的 outline-tracker 插件在滚动/编辑时高频发布快照。
// 若经 App 的 useState 中转，每次发布都会重渲染整棵 App 树（含编辑器包装、
// 顶栏、状态栏等），万行文档滚动时造成明显掉帧（issue #31）。
// 改为独立 store 后只有 OutlinePanel 订阅更新，重渲染范围收敛到面板自身。

import { create } from "zustand";
import {
  EMPTY_EDITOR_OUTLINE,
  type EditorOutlineSnapshot,
} from "../lib/outline";

interface OutlineState {
  /** 快照对应的文件路径，避免切换文件瞬间显示旧大纲 */
  file: string | null;
  snapshot: EditorOutlineSnapshot;
  publish: (file: string | null, snapshot: EditorOutlineSnapshot) => void;
}

export const useOutline = create<OutlineState>((set) => ({
  file: null,
  snapshot: EMPTY_EDITOR_OUTLINE,
  publish: (file, snapshot) => set({ file, snapshot }),
}));

/** 未匹配当前文件时返回空快照的稳定选择器，避免无谓重渲染 */
export function selectOutlineForFile(
  s: OutlineState,
  currentFile: string | null,
): EditorOutlineSnapshot {
  return s.file === currentFile ? s.snapshot : EMPTY_EDITOR_OUTLINE;
}
