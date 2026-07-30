// UI 状态管理
// 跟踪侧边栏、大纲面板等 UI 元素的可见性，配合全局快捷键切换。
// 状态持久化到 localStorage，下次启动恢复用户偏好。

import { create } from "zustand";

interface UIState {
  /** 侧边栏是否可见 */
  sidebarVisible: boolean;
  /** 大纲面板是否可见 */
  outlineVisible: boolean;
  /** 禅模式：隐藏所有 UI，仅保留编辑器 */
  zenMode: boolean;
  /** 切换侧边栏可见性 */
  toggleSidebar: () => void;
  /** 切换大纲面板可见性 */
  toggleOutline: () => void;
  /** 直接设置侧边栏可见性 */
  setSidebarVisible: (v: boolean) => void;
  /** 直接设置大纲面板可见性 */
  setOutlineVisible: (v: boolean) => void;
  /** 切换禅模式 */
  toggleZenMode: () => void;
  /** 直接设置禅模式 */
  setZenMode: (v: boolean) => void;
}

const STORAGE_KEY = "inkling-ui";

interface PersistedUI {
  sidebarVisible: boolean;
  outlineVisible: boolean;
}

const DEFAULTS: PersistedUI = {
  sidebarVisible: true,
  outlineVisible: true,
};

function loadPersisted(): PersistedUI {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<PersistedUI>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

function persist(s: PersistedUI): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // 忽略写入失败
  }
}

const initial = loadPersisted();

export const useUI = create<UIState>((set, get) => ({
  sidebarVisible: initial.sidebarVisible,
  outlineVisible: initial.outlineVisible,
  // 禅模式不持久化，默认从普通模式启动
  zenMode: false,

  toggleSidebar: () => {
    const next = !get().sidebarVisible;
    set({ sidebarVisible: next });
    persist({ sidebarVisible: next, outlineVisible: get().outlineVisible });
  },
  toggleOutline: () => {
    const next = !get().outlineVisible;
    set({ outlineVisible: next });
    persist({ sidebarVisible: get().sidebarVisible, outlineVisible: next });
  },
  setSidebarVisible: (v) => {
    set({ sidebarVisible: v });
    persist({ sidebarVisible: v, outlineVisible: get().outlineVisible });
  },
  setOutlineVisible: (v) => {
    set({ outlineVisible: v });
    persist({ sidebarVisible: get().sidebarVisible, outlineVisible: v });
  },
  toggleZenMode: () => set({ zenMode: !get().zenMode }),
  setZenMode: (v) => set({ zenMode: v }),
}));
