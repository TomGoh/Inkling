// 主题状态管理
// 内置 light / dark 两套主题，通过 data-theme 属性切换 CSS 变量。
// 支持加载用户自定义 CSS 文件，注入到文档覆盖默认样式。
// 主题选择持久化到 localStorage，下次启动自动恢复。

import { create } from "zustand";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export type ThemeMode = "light" | "dark";

interface ThemeState {
  /** 当前主题模式 */
  mode: ThemeMode;
  /** 用户自定义 CSS 内容（null 表示未加载） */
  customCSS: string | null;
  /** 自定义 CSS 文件路径（用于显示） */
  customCSSPath: string | null;
  /** 切换明暗主题 */
  setMode: (mode: ThemeMode) => void;
  /** 加载自定义 CSS 文件 */
  loadCustomCSS: () => Promise<void>;
  /** 清除自定义 CSS */
  clearCustomCSS: () => void;
}

const STORAGE_KEY = "inkling-theme";

/** 从 localStorage 恢复主题，无记录时跟随系统偏好 */
function getInitialMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // localStorage 不可用时忽略
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** 应用主题到 <html> 元素的 data-theme 属性 */
function applyMode(mode: ThemeMode) {
  document.documentElement.setAttribute("data-theme", mode);
}

/** 注入或更新自定义 CSS <style> 标签 */
const CUSTOM_STYLE_ID = "inkling-custom-theme";
function applyCustomCSS(css: string | null) {
  const existing = document.getElementById(CUSTOM_STYLE_ID);
  if (css) {
    const el = existing ?? document.createElement("style");
    el.id = CUSTOM_STYLE_ID;
    el.textContent = css;
    if (!existing) document.head.appendChild(el);
  } else {
    existing?.remove();
  }
}

// 初始化时立即应用，避免首屏闪烁
const initialMode = getInitialMode();
applyMode(initialMode);

export const useTheme = create<ThemeState>((set) => {
  // 监听多窗口/跨标签页的 localStorage 变化
  if (typeof window !== "undefined") {
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY && (e.newValue === "light" || e.newValue === "dark")) {
        applyMode(e.newValue);
        set({ mode: e.newValue });
      }
    });
  }

  return {
    mode: initialMode,
    customCSS: null,
    customCSSPath: null,

    setMode: (mode) => {
      applyMode(mode);
      try {
        localStorage.setItem(STORAGE_KEY, mode);
      } catch {
        // 忽略写入失败
      }
      set({ mode });
    },

    loadCustomCSS: async () => {
      if (!isTauri()) {
        alert("自定义 CSS 仅在桌面端支持");
        return;
      }
      const selected = await open({
        multiple: false,
        filters: [{ name: "CSS", extensions: ["css"] }],
      });
      if (typeof selected !== "string") return;
      try {
        const css = await invoke<string>("read_text_file", {
          filePath: selected,
        });
        applyCustomCSS(css);
        set({ customCSS: css, customCSSPath: selected });
      } catch (e) {
        alert(`读取 CSS 文件失败：${e}`);
      }
    },

    clearCustomCSS: () => {
      applyCustomCSS(null);
      set({ customCSS: null, customCSSPath: null });
    },
  };
});
