// 编辑器偏好设置状态
// 集中管理可由用户开关的编辑器行为，持久化到 localStorage。
// 偏好设置面板（SettingsPanel）直接订阅本 store。
// 各编辑器插件通过 useSettings.getState() 在运行时读取最新值，无需重建编辑器。

import { create } from "zustand";

/** 代码块语法高亮主题 */
export type CodeBlockTheme = "oneDark" | "light" | "none";

/** 编辑器缩放范围与步进 */
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;
export const ZOOM_STEP = 0.1;
export const ZOOM_DEFAULT = 1;

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
  /** 拼写检查：浏览器原生拼写检查（红波浪线） */
  spellcheck: boolean;
  /** 编辑器缩放倍率（0.5-3.0，1 表示 100%） */
  editorZoom: number;
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
  /** 切换拼写检查 */
  setSpellcheck: (v: boolean) => void;
  /** 增量调整缩放（正数放大，负数缩小），自动夹到 [ZOOM_MIN, ZOOM_MAX] */
  adjustEditorZoom: (delta: number) => void;
  /** 直接设置缩放倍率 */
  setEditorZoom: (v: number) => void;
  /** 重置缩放到 100% */
  resetEditorZoom: () => void;
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
  spellcheck: boolean;
  editorZoom: number;
}

const DEFAULTS: PersistedSettings = {
  formulaAutoNumber: false,
  codeBlockTheme: "none",
  focusMode: false,
  typewriterMode: false,
  autoPair: true,
  spellcheck: false,
  editorZoom: ZOOM_DEFAULT,
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

/** 将任意倍率夹到合法范围，并保留一位小数避免浮点累积误差 */
function clampZoom(v: number): number {
  const rounded = Math.round(v * 10) / 10;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, rounded));
}

const initial = loadPersisted();

export const useSettings = create<SettingsState>((set, get) => {
  // 监听多窗口/跨标签页的 settings storage 同步
  if (typeof window !== "undefined") {
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue) as Partial<PersistedSettings>;
          const merged = { ...DEFAULTS, ...parsed };
          set({
            formulaAutoNumber: merged.formulaAutoNumber,
            codeBlockTheme: merged.codeBlockTheme,
            focusMode: merged.focusMode,
            typewriterMode: merged.typewriterMode,
            autoPair: merged.autoPair,
            spellcheck: merged.spellcheck,
            editorZoom: clampZoom(merged.editorZoom),
          });
        } catch {
          // 忽略非法 JSON
        }
      }
    });
  }

  return {
    formulaAutoNumber: initial.formulaAutoNumber,
    codeBlockTheme: initial.codeBlockTheme,
    focusMode: initial.focusMode,
    typewriterMode: initial.typewriterMode,
    autoPair: initial.autoPair,
    spellcheck: initial.spellcheck,
    editorZoom: clampZoom(initial.editorZoom),

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
    setSpellcheck: (v) => {
      set({ spellcheck: v });
      persist(snapshot(get()));
    },
    adjustEditorZoom: (delta) => {
      const next = clampZoom(get().editorZoom + delta);
      set({ editorZoom: next });
      persist(snapshot(get()));
    },
    setEditorZoom: (v) => {
      const next = clampZoom(v);
      set({ editorZoom: next });
      persist(snapshot(get()));
    },
    resetEditorZoom: () => {
      set({ editorZoom: ZOOM_DEFAULT });
      persist(snapshot(get()));
    },
    reset: () => {
      set({ ...DEFAULTS });
      persist(DEFAULTS);
    },
  };
});

function snapshot(s: SettingsState): PersistedSettings {
  return {
    formulaAutoNumber: s.formulaAutoNumber,
    codeBlockTheme: s.codeBlockTheme,
    focusMode: s.focusMode,
    typewriterMode: s.typewriterMode,
    autoPair: s.autoPair,
    spellcheck: s.spellcheck,
    editorZoom: s.editorZoom,
  };
}
