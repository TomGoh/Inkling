/**
 * #226 §3 自研内置主题的**静态断言**（防漏覆盖 / 防「只做变量覆盖」被破）：
 * 数量与身份、必需 token、只允许 `:root` 变量块、token 必须已存在于白名单、值形态合法（挡住拼写错误）、
 * 成对互指、以及「注入后落在 `@layer theme`」的行为断言。
 */
import { describe, expect, it } from "vitest";
import { BUILTIN_SELF_THEMES, REQUIRED_OVERRIDES } from "../../src/theme/builtin-themes";
import { BUILTIN_THEMES, getTheme, isBuiltinThemeId, listThemes, themeModeOf } from "../../src/theme/registry";
import { applyTheme, currentInjectedThemeCss } from "../../src/theme/session";
import whitelist from "../../src/theme/token-whitelist.json";

const knownTokens = new Set<string>([
  ...(whitelist.base as string[]),
  ...(whitelist.shell as string[]),
  ...(whitelist.content as string[]),
]);

/** 取出 `--token: value;` 声明（值可跨行续行，这里按行匹配足够：本文件的值都是单行） */
function declarations(css: string): { prop: string; value: string }[] {
  return [...css.matchAll(/^\s*(--[\w-]+)\s*:\s*([^;]+);/gm)].map((m) => ({
    prop: m[1],
    value: m[2].trim(),
  }));
}

describe("#226 自研内置主题：数量、身份与成对关系", () => {
  it("至少 4 套，全部是 builtin:* 且 mode 合法", () => {
    expect(BUILTIN_SELF_THEMES.length).toBeGreaterThanOrEqual(4);
    for (const t of BUILTIN_SELF_THEMES) {
      expect(t.id).toMatch(/^builtin:[a-z0-9-]+$/);
      expect(["light", "dark"]).toContain(t.mode);
      expect(t.source).toBe("builtin");
      expect(t.name.trim().length).toBeGreaterThan(0);
      expect(isBuiltinThemeId(t.id)).toBe(true);
      expect(themeModeOf(t.id)).toBe(t.mode);
    }
  });

  it("四类风格都有落点：亮色技术风 / 暗色技术风 / 暖色阅读风 / 高对比", () => {
    const ids = BUILTIN_SELF_THEMES.map((t) => t.id);
    expect(ids).toContain("builtin:tech");
    expect(ids).toContain("builtin:tech-dark");
    expect(ids).toContain("builtin:sepia");
    expect(ids).toContain("builtin:contrast");
  });

  it("成对变体双向互指（tech ↔ tech-dark），且内置清单包含全部自研主题", () => {
    expect(getTheme("builtin:tech")?.variantOf).toBe("builtin:tech-dark");
    expect(getTheme("builtin:tech-dark")?.variantOf).toBe("builtin:tech");
    const ids = listThemes().map((t) => t.id);
    for (const t of BUILTIN_SELF_THEMES) expect(ids).toContain(t.id);
    expect(BUILTIN_THEMES.length).toBe(2 + BUILTIN_SELF_THEMES.length);
  });

  it("载体是构建期文本（kind=text）→ 同步可得、不走快照（零闪烁）", () => {
    for (const t of BUILTIN_SELF_THEMES) {
      expect(t.css?.kind).toBe("text");
    }
  });
});

describe("#226 自研内置主题：只做 token 覆盖，不漏覆盖、不出幽灵 token", () => {
  it.each(BUILTIN_SELF_THEMES.map((t) => [t.id, t] as const))("%s 覆盖必需 token", (_id, theme) => {
    const css = theme.css?.kind === "text" ? theme.css.text : "";
    const props = new Set(declarations(css).map((d) => d.prop));
    for (const required of REQUIRED_OVERRIDES) {
      expect(props.has(required), `${theme.id} 缺少 ${required}`).toBe(true);
    }
  });

  it.each(BUILTIN_SELF_THEMES.map((t) => [t.id, t] as const))("%s 只含 :root 变量块（不写选择器/at-rule）", (_id, theme) => {
    const css = theme.css?.kind === "text" ? theme.css.text : "";
    // 去掉变量声明行后，剩下的应当只有 `:root {` 与 `}`
    const skeleton = css
      .replace(/^\s*--[\w-]+\s*:\s*[^;]+;/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    expect(skeleton).toEqual([":root {", "}"]);
    expect(css).not.toMatch(/@(media|import|layer|keyframes|font-face)/i);
    expect(css).not.toMatch(/[.#][\w-]+\s*\{/);
  });

  it.each(BUILTIN_SELF_THEMES.map((t) => [t.id, t] as const))("%s 覆盖的 token 必须已存在于白名单（不出幽灵 token）", (_id, theme) => {
    const css = theme.css?.kind === "text" ? theme.css.text : "";
    for (const { prop } of declarations(css)) {
      expect(knownTokens.has(prop), `${theme.id} 里的 ${prop} 不在 token 白名单`).toBe(true);
    }
  });

  it.each(BUILTIN_SELF_THEMES.map((t) => [t.id, t] as const))("%s 的值形态合法（挡住拼写错误，如 #095janvier）", (_id, theme) => {
    const css = theme.css?.kind === "text" ? theme.css.text : "";
    for (const { prop, value } of declarations(css)) {
      const ok =
        /^#[0-9a-f]{3,8}$/i.test(value) ||
        /^rgba?\([\d\s.,%]+\)$/i.test(value) ||
        /^var\(--[\w-]+\)$/i.test(value) ||
        /^\d+(\.\d+)?(px|rem|em|s|ms)$/i.test(value) ||
        // 字体栈（`--editor-font` 一类）
        /^[\w\s"',-]+,\s*(serif|sans-serif|monospace)$/i.test(value) ||
        // 阴影/聚焦环等**多段值**：以长度开头（含无单位的 0），如 `0 0 0 3px #0033cc`
        /^-?[\d.]+(px|rem|em|%|s|ms)?(\s|$)/.test(value);
      expect(ok, `${theme.id} 的 ${prop}: ${value} 形态可疑`).toBe(true);
    }
  });
});

describe("#226 自研内置主题：注入落在 @layer theme（层序与优先级不变）", () => {
  /** 注入是**微任务派发**（`#225` 的写样式范式）→ 断言前让出一轮，避免读到尚未写入的空内容 */
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("applyTheme 后产物包在 @layer theme 内，且 data-theme = 该主题的 mode", async () => {
    const theme = getTheme("builtin:tech-dark")!;
    applyTheme(theme, { persist: false });
    // 属性是同步写的（反 FOUC 依赖这一点），CSS 文本是微任务派发
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme-id")).toBe("builtin:tech-dark");
    await flush();
    const injected = currentInjectedThemeCss() ?? "";
    expect(injected).toContain("@layer theme");
    // 自研主题是受信内容：直接注入（不经 #306 选择器收敛），故 `:root` 变量保留原样
    expect(injected).toContain(":root");
    expect(injected).toContain("--editor-bg");

    // 回到基线：内置基线 css.kind = none → 卸载主题样式
    applyTheme(getTheme("builtin:light")!, { persist: false });
    await flush();
    expect(currentInjectedThemeCss()).toBe(null);
    expect(document.documentElement.getAttribute("data-theme-id")).toBe("builtin:light");
  });
});
