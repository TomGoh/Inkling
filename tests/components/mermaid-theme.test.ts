/**
 * #226 §5.1 Mermaid 主题跟随（实测两处硬约束 + 主题变化重渲染）：
 * ① `theme` 必须随 `data-theme` 切换（`default` / `dark`）；
 * ② SVG 缓存 key 必须并入主题身份，否则换主题命中旧缓存 → 图表保持旧配色；
 * ③ 主题变化必须能通知到活动图表（NodeView 不是 React 组件，靠单一广播点驱动重渲染）；
 * ④ `themeVariables.fontSize` 是防「多行节点文字被裁切」的锁定值，任何跟随逻辑都不得覆盖它。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MERMAID_CONFIG,
  currentMermaidTheme,
  mermaidCacheKey,
  mermaidConfigFor,
  mermaidThemeFor,
  registerMermaidInvalidator,
} from "../../src/components/Editor/mermaid-view";
import { notifyThemeChanged } from "../../src/theme/session";

describe("#226 Mermaid：主题映射", () => {
  beforeEach(() => document.documentElement.setAttribute("data-theme", "light"));
  afterEach(() => document.documentElement.removeAttribute("data-theme"));

  it("dark → dark；其余（light / 缺失 / 垃圾值）→ default", () => {
    expect(mermaidThemeFor("dark")).toBe("dark");
    expect(mermaidThemeFor("light")).toBe("default");
    expect(mermaidThemeFor(null)).toBe("default");
    expect(mermaidThemeFor(undefined)).toBe("default");
    expect(mermaidThemeFor("purple")).toBe("default");
  });

  it("当前主题取自文档根 `data-theme`（与 App.css 变量块同一开关）", () => {
    expect(currentMermaidTheme()).toBe("default");
    document.documentElement.setAttribute("data-theme", "dark");
    expect(currentMermaidTheme()).toBe("dark");
  });

  it("按主题产出配置：切换 `theme` 但**不覆盖** fontSize 锁定值", () => {
    expect(mermaidConfigFor("dark").theme).toBe("dark");
    expect(mermaidConfigFor("default").theme).toBe("default");
    for (const theme of ["default", "dark"] as const) {
      const cfg = mermaidConfigFor(theme);
      expect(cfg.themeVariables.fontSize).toBe(MERMAID_CONFIG.themeVariables.fontSize);
      expect(cfg.flowchart).toEqual(MERMAID_CONFIG.flowchart);
      expect(cfg.securityLevel).toBe("strict");
    }
  });
});

describe("#226 Mermaid：缓存必须并入主题身份（否者换主题图表不变色）", () => {
  it("同一源码在明/暗下是两个不同的缓存 key", () => {
    const src = "graph TD; A-->B";
    expect(mermaidCacheKey(src, "default")).not.toBe(mermaidCacheKey(src, "dark"));
    expect(mermaidCacheKey(src, "default")).toBe(`default::${src}`);
    expect(mermaidCacheKey(src, "dark")).toBe(`dark::${src}`);
  });

  it("同主题同源码 → 同 key（缓存仍能命中，不牺牲性能）", () => {
    expect(mermaidCacheKey("graph TD", "dark")).toBe(mermaidCacheKey("graph TD", "dark"));
  });
});

describe("#226 Mermaid：主题变化广播驱动重渲染", () => {
  it("登记的回调在 notifyThemeChanged 时被触发（活动图表重画）", () => {
    const invalidate = vi.fn();
    const off = registerMermaidInvalidator(invalidate);
    notifyThemeChanged("builtin:tech-dark", "dark");
    expect(invalidate).toHaveBeenCalledTimes(1);
    notifyThemeChanged("builtin:light", "light");
    expect(invalidate).toHaveBeenCalledTimes(2);
    off();
    notifyThemeChanged("builtin:tech", "light");
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  it("单个回调抛错不影响其它图表（逐个隔离）", () => {
    const boom = vi.fn(() => {
      throw new Error("boom");
    });
    const ok = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const offBoom = registerMermaidInvalidator(boom);
    const offOk = registerMermaidInvalidator(ok);
    notifyThemeChanged("builtin:sepia", "light");
    expect(boom).toHaveBeenCalled();
    expect(ok).toHaveBeenCalled(); // 前一个抛错不阻断后续
    offBoom();
    offOk();
    warn.mockRestore();
  });
});
