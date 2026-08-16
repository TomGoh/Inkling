// 文件冲突状态 store
// useFileWatcher 检测到外部修改且本地 dirty 时，把冲突上下文写到这里，
// ConflictDialog 订阅渲染。独立小 store：冲突是瞬态 UI 状态，
// 不属于 workspace 领域数据，且避免订阅 workspace 的组件被冲突流程牵连重渲染。

import { create } from "zustand";

export interface FileConflict {
  /** 冲突文件完整路径 */
  filePath: string;
  /** 本地未保存内容 */
  localContent: string;
  /** 磁盘最新内容（检测到冲突时读取） */
  diskContent: string;
  /** 外部修改发生时间（展示用） */
  detectedAt: number;
}

interface ConflictState {
  conflict: FileConflict | null;
  /** 弹出冲突对话框（读取磁盘内容后调用） */
  openConflict: (c: FileConflict) => void;
  /** 关闭对话框（不做任何处理，继续编辑） */
  dismiss: () => void;
}

export const useConflict = create<ConflictState>((set) => ({
  conflict: null,
  openConflict: (c) => set({ conflict: c }),
  dismiss: () => set({ conflict: null }),
}));
