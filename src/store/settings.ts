// 编辑器偏好设置状态
// 集中管理可由用户开关的编辑器行为，持久化到 localStorage。
// 偏好设置面板（SettingsPanel）直接订阅本 store。
// 各编辑器插件通过 useSettings.getState() 在运行时读取最新值，无需重建编辑器。

import { create } from "zustand";

/** 代码块语法高亮主题 */
export type CodeBlockTheme = "oneDark" | "light" | "none";

export interface SettingsState {
  /** 公式自动编号（display 公式按文档顺序编号 (1)(2)...） */
  formulaAutoNumber: boolean;
  /** 代码块语法高亮主题 */
  codeBlockTheme: CodeBlockTheme;
  /** 专注模式：非当前段落弱化 */
  focusMode: boolean;
  /** 打字机模式：当前编辑行保持垂直居中 */
  typewriterMode: boolean;
  /** 自动配对补全：输入括号/引号自动配对，光标置中 */
  autoPair: boolean;
  /** 切换公式自动编号 */
  setFormulaAutoNumber: (v: boolean) => void;
  /** 设置代码块主题 */
  setCodeBlockTheme: (v: CodeBlockTheme) => void;
  /** 切换专注模式 */
  setFocusMode: (v: boolean) => void;
  /** 切换打字机模式 */
  setTypewriterMode: (v: boolean) => void;
  /** 切换自动配对 */
  setAutoPair: (v: boolean) => void;
  /** 重置全部为默认值 */
  reset: () => void;
}

const STORAGE_KEY = "inkling-settings";

interface PersistedSettings {
  formulaAutoNumber: boolean;
  codeBlockTheme: CodeBlockTheme;
  focusMode: boolean;
  typewriterMode: boolean;
  autoPair: boolean;
}

const DEFAULTS: PersistedSettings = {
  formulaAutoNumber: false,
  codeBlockTheme: "oneDark",
  focusMode: false,
  typewriterMode: false,
  autoPair: true,
};

function loadPersisted(): PersistedSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<PersistedSettings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

function persist(s: PersistedSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // 忽略写入失败
  }
}

const initial = loadPersisted();

export const useSettings = create<SettingsState>((set, get) => ({
  formulaAutoNumber: initial.formulaAutoNumber,
  codeBlockTheme: initial.codeBlockTheme,
  focusMode: initial.focusMode,
  typewriterMode: initial.typewriterMode,
  autoPair: initial.autoPair,

  setFormulaAutoNumber: (v) => {
    set({ formulaAutoNumber: v });
    persist(snapshot(get()));
  },
  setCodeBlockTheme: (v) => {
    set({ codeBlockTheme: v });
    persist(snapshot(get()));
  },
  setFocusMode: (v) => {
    set({ focusMode: v });
    persist(snapshot(get()));
  },
  setTypewriterMode: (v) => {
    set({ typewriterMode: v });
    persist(snapshot(get()));
  },
  setAutoPair: (v) => {
    set({ autoPair: v });
    persist(snapshot(get()));
  },
  reset: () => {
    set({ ...DEFAULTS });
    persist(DEFAULTS);
  },
}));

function snapshot(s: SettingsState): PersistedSettings {
  return {
    formulaAutoNumber: s.formulaAutoNumber,
    codeBlockTheme: s.codeBlockTheme,
    focusMode: s.focusMode,
    typewriterMode: s.typewriterMode,
    autoPair: s.autoPair,
  };
}
