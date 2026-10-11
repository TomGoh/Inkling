/**
 * #226 §3：**自研内置主题**（≥4 套，与 `#308` 的预装第三方 ≥2 套合计 ≥6）。
 *
 * 设计口径（`04` §3 / G4 / G6）：
 * - 载体 = `AppTheme.css = { kind: "text" }`：构建期同步可得 → **零闪烁**（不走快照，`isSnapshotEligible` 为假）；
 *   注入仍由 `#225` 的 `injectThemeCss` 包进 `@layer theme`（层序与优先级不变）。
 * - **只做 token 覆盖，不写选择器**：主题差异全部落在 `--content-*` / `--shell-*` / 基础层变量上，
 *   从而不引入新的散落硬编码色（`03` S9），也不会与 `#306` 的选择器收敛/作用域规则冲突。
 * - `data-theme` **保持 light/dark 二值**（由 `theme.mode` 派生）：自研主题是靠 `theme` 层的变量覆盖做出差异，
 *   不扩 `data-theme` 取值——这样 `App.css` 的两块基线、导出、`#306` 兼容层的既有契约都不需要改。
 * - 自研主题是**受信内容**（非第三方），因此**允许全局覆盖**（含外壳 `--shell-*`），不走第三方主题的作用域收敛。
 *
 * 每套都必须覆盖「四类风格」之一，并有静态断言（`tests/theme/theme-builtin.test.ts`）防漏覆盖。
 */
import type { AppTheme } from "./registry";

/** 高对比（a11y）主题共用的超强边框/文字对比度 */
const A11Y_BORDER = "#000000";

/**
 * 亮色技术风：冷灰底 + 蓝青强调，直角偏小圆角，等宽字体优先。
 */
const TECH_CSS = `:root {
  --bg-subtle: #eef2f7;
  --bg-elevated: #ffffff;
  --editor-bg: #ffffff;
  --topbar-bg: #f4f7fb;
  --sidebar-bg: #eef2f7;
  --outline-bg: #eef2f7;
  --statusbar-bg: #eef2f7;
  --text: #0f1b2d;
  --text-muted: #47607f;
  --text-faint: #7d93ad;
  --border: #c9d6e4;
  --border-strong: #a9bdd3;
  --accent: #0b6bcb;
  --accent-hover: #0958a8;
  --accent-subtle: rgba(11, 107, 203, 0.12);
  --content-link: #0b6bcb;
  --content-inline-code-bg: rgba(11, 107, 203, 0.08);
  --content-quote-border: #0b6bcb;
  --content-quote-bg: #f1f6fc;
  --content-table-head-bg: rgba(11, 107, 203, 0.08);
  --shell-scrollbar-thumb: rgba(71, 96, 127, 0.35);
  --radius-sm: 3px;
  --radius-md: 4px;
  --radius-lg: 6px;
}`;

/** 暗色技术风：深蓝黑 + 青强调（与 `tech` 成对） */
const TECH_DARK_CSS = `:root {
  --bg-subtle: #101823;
  --bg-elevated: #18212e;
  --editor-bg: #0d141d;
  --topbar-bg: #131c28;
  --sidebar-bg: #101823;
  --outline-bg: #101823;
  --statusbar-bg: #101823;
  --text: #dce6f2;
  --text-muted: #9db0c7;
  --text-faint: #6d8098;
  --border: #2a3646;
  --border-strong: #3a4a5e;
  --accent: #4cc2ff;
  --accent-hover: #7ad3ff;
  --accent-subtle: rgba(76, 194, 255, 0.16);
  --accent-fg: #04222f;
  --content-link: #7ad3ff;
  --content-inline-code-bg: rgba(76, 194, 255, 0.12);
  --content-quote-border: #4cc2ff;
  --content-quote-bg: #16212e;
  --content-table-head-bg: rgba(76, 194, 255, 0.1);
  --shell-scrollbar-thumb: rgba(157, 176, 199, 0.35);
  --radius-sm: 3px;
  --radius-md: 4px;
  --radius-lg: 6px;
}`;

/** 暖色阅读风：米色纸感 + 棕墨文字 + 衬线正文 */
const SEPIA_CSS = `:root {
  --bg-subtle: #f3ece0;
  --bg-elevated: #fffaf1;
  --editor-bg: #fdf6e9;
  --topbar-bg: #f7f0e3;
  --sidebar-bg: #f3ece0;
  --outline-bg: #f3ece0;
  --statusbar-bg: #f3ece0;
  --text: #3d3226;
  --text-muted: #6d5c48;
  --text-faint: #96836b;
  --border: #ddceb6;
  --border-strong: #c8b498;
  --accent: #a2542a;
  --accent-hover: #86431f;
  --accent-subtle: rgba(162, 84, 42, 0.12);
  --content-link: #a2542a;
  --content-inline-code-bg: rgba(162, 84, 42, 0.1);
  --content-quote-border: #c8a882;
  --content-quote-bg: #f6efe0;
  --content-table-head-bg: rgba(162, 84, 42, 0.08);
  --shell-scrollbar-thumb: rgba(109, 92, 72, 0.3);
  --editor-font: Georgia, "Songti SC", "Noto Serif SC", "Source Han Serif SC", serif;
}`;

/** 高对比（a11y）：纯黑文字 / 纯白底 / 2px 级对比边框，聚焦环加强 */
const CONTRAST_CSS = `:root {
  --bg-subtle: #ffffff;
  --bg-elevated: #ffffff;
  --editor-bg: #ffffff;
  --topbar-bg: #ffffff;
  --sidebar-bg: #ffffff;
  --outline-bg: #ffffff;
  --statusbar-bg: #ffffff;
  --text: #000000;
  --text-muted: #1a1a1a;
  --text-faint: #333333;
  --border: ${A11Y_BORDER};
  --border-strong: ${A11Y_BORDER};
  --accent: #0033cc;
  --accent-hover: #001f7f;
  --accent-subtle: rgba(0, 51, 204, 0.18);
  --content-link: #0033cc;
  --content-inline-code-bg: #f0f0f0;
  --content-quote-border: ${A11Y_BORDER};
  --content-quote-bg: #f5f5f5;
  --content-table-head-bg: #e8e8e8;
  --shell-scrollbar-thumb: #000000;
  --shell-switch-bg: #4d4d4d;
  --ring: 0 0 0 3px #0033cc;
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.5);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.5);
}`;

/**
 * 自研内置主题清单（顺序即菜单顺序：成对相邻）。
 * `variantOf` 显式互指（这里不是文件扫描出来的描述符，`pairVariants` 不参与）。
 */
export const BUILTIN_SELF_THEMES: readonly AppTheme[] = [
  {
    id: "builtin:tech",
    name: "技术（亮）",
    mode: "light",
    source: "builtin",
    variantOf: "builtin:tech-dark",
    css: { kind: "text", text: TECH_CSS },
  },
  {
    id: "builtin:tech-dark",
    name: "技术（暗）",
    mode: "dark",
    source: "builtin",
    variantOf: "builtin:tech",
    css: { kind: "text", text: TECH_DARK_CSS },
  },
  {
    id: "builtin:sepia",
    name: "纸感阅读",
    mode: "light",
    source: "builtin",
    css: { kind: "text", text: SEPIA_CSS },
  },
  {
    id: "builtin:contrast",
    name: "高对比",
    mode: "light",
    source: "builtin",
    css: { kind: "text", text: CONTRAST_CSS },
  },
];

/** 自研主题必须覆盖的 token（静态断言用：漏覆盖即回归） */
export const REQUIRED_OVERRIDES: readonly string[] = [
  "--editor-bg",
  "--text",
  "--accent",
  "--border",
  "--content-link",
];
