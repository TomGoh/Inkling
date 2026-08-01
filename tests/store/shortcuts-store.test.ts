// 快捷键 store 测试
// 覆盖 getBinding/setBinding/resetBinding/resetAll 的 store 行为与 localStorage 持久化

import { describe, it, expect, vi, beforeEach } from "vitest";

async function loadShortcuts() {
  vi.resetModules();
  const mod = await import("../../src/store/shortcuts");
  return mod.useShortcuts;
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("useShortcuts store", () => {
  it("无持久化时 getBinding 返回默认值", async () => {
    const useShortcuts = await loadShortcuts();
    expect(useShortcuts.getState().getBinding("find")).toBe("mod+f");
    expect(useShortcuts.getState().getBinding("toggleSidebar")).toBe("mod+\\");
    expect(useShortcuts.getState().getBinding("toggleOutline")).toBe("mod+'");
    expect(useShortcuts.getState().getBinding("showShortcuts")).toBe("mod+/");
    expect(useShortcuts.getState().getBinding("openSettings")).toBe("mod+,");
  });

  it("从 localStorage 恢复自定义绑定", async () => {
    localStorage.setItem(
      "inkling-shortcuts",
      JSON.stringify({ overrides: { find: "mod+shift+f" } }),
    );
    const useShortcuts = await loadShortcuts();
    expect(useShortcuts.getState().getBinding("find")).toBe("mod+shift+f");
    // 未覆盖的仍用默认
    expect(useShortcuts.getState().getBinding("toggleSidebar")).toBe("mod+\\");
  });

  it("localStorage 损坏时回退默认值", async () => {
    localStorage.setItem("inkling-shortcuts", "broken{");
    const useShortcuts = await loadShortcuts();
    expect(useShortcuts.getState().getBinding("find")).toBe("mod+f");
  });

  it("setBinding 覆盖默认并持久化", async () => {
    const useShortcuts = await loadShortcuts();
    useShortcuts.getState().setBinding("find", "mod+r");
    expect(useShortcuts.getState().getBinding("find")).toBe("mod+r");
    const persisted = JSON.parse(localStorage.getItem("inkling-shortcuts")!);
    expect(persisted.overrides.find).toBe("mod+r");
  });

  it("setBinding 不影响其他绑定", async () => {
    const useShortcuts = await loadShortcuts();
    useShortcuts.getState().setBinding("find", "mod+r");
    useShortcuts.getState().setBinding("toggleSidebar", "mod+b");
    expect(useShortcuts.getState().getBinding("find")).toBe("mod+r");
    expect(useShortcuts.getState().getBinding("toggleSidebar")).toBe("mod+b");
    expect(useShortcuts.getState().getBinding("toggleOutline")).toBe("mod+'");
  });

  it("resetBinding 恢复单个绑定默认值", async () => {
    const useShortcuts = await loadShortcuts();
    useShortcuts.getState().setBinding("find", "mod+r");
    useShortcuts.getState().resetBinding("find");
    expect(useShortcuts.getState().getBinding("find")).toBe("mod+f");
    // 持久化中也应移除该 override
    const persisted = JSON.parse(localStorage.getItem("inkling-shortcuts")!);
    expect(persisted.overrides.find).toBeUndefined();
  });

  it("resetBinding 不影响其他自定义", async () => {
    const useShortcuts = await loadShortcuts();
    useShortcuts.getState().setBinding("find", "mod+r");
    useShortcuts.getState().setBinding("toggleSidebar", "mod+b");
    useShortcuts.getState().resetBinding("find");
    expect(useShortcuts.getState().getBinding("find")).toBe("mod+f");
    expect(useShortcuts.getState().getBinding("toggleSidebar")).toBe("mod+b");
  });

  it("resetAll 清空所有自定义绑定", async () => {
    const useShortcuts = await loadShortcuts();
    useShortcuts.getState().setBinding("find", "mod+r");
    useShortcuts.getState().setBinding("toggleSidebar", "mod+b");
    useShortcuts.getState().resetAll();
    expect(useShortcuts.getState().getBinding("find")).toBe("mod+f");
    expect(useShortcuts.getState().getBinding("toggleSidebar")).toBe("mod+\\");
    expect(useShortcuts.getState().overrides).toEqual({});
    const persisted = JSON.parse(localStorage.getItem("inkling-shortcuts")!);
    expect(persisted.overrides).toEqual({});
  });

  it("overrides 状态反映当前自定义", async () => {
    const useShortcuts = await loadShortcuts();
    expect(useShortcuts.getState().overrides).toEqual({});
    useShortcuts.getState().setBinding("find", "mod+r");
    expect(useShortcuts.getState().overrides).toEqual({ find: "mod+r" });
  });
});
