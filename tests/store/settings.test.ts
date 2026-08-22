// 设置 store 测试
// 覆盖默认值、localStorage 恢复、各 setter、reset、持久化写入

import { describe, it, expect, vi, beforeEach } from "vitest";

async function loadSettings() {
  vi.resetModules();
  const mod = await import("../../src/store/settings");
  return mod.useSettings;
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("useSettings store", () => {
  it("无持久化时使用默认值", async () => {
    const useSettings = await loadSettings();
    const s = useSettings.getState();
    expect(s.formulaAutoNumber).toBe(false);
    expect(s.codeBlockTheme).toBe("none");
    expect(s.focusMode).toBe(false);
    expect(s.typewriterMode).toBe(false);
    expect(s.autoPair).toBe(true);
    expect(s.spellcheck).toBe(false);
  });

  it("从 localStorage 恢复用户设置", async () => {
    localStorage.setItem(
      "inkling-settings",
      JSON.stringify({
        formulaAutoNumber: true,
        codeBlockTheme: "light",
        focusMode: true,
        typewriterMode: true,
        autoPair: false,
        spellcheck: true,
      }),
    );
    const useSettings = await loadSettings();
    const s = useSettings.getState();
    expect(s.formulaAutoNumber).toBe(true);
    expect(s.codeBlockTheme).toBe("light");
    expect(s.focusMode).toBe(true);
    expect(s.typewriterMode).toBe(true);
    expect(s.autoPair).toBe(false);
    expect(s.spellcheck).toBe(true);
  });

  it("部分持久化时缺失字段回退默认值", async () => {
    localStorage.setItem(
      "inkling-settings",
      JSON.stringify({ focusMode: true }),
    );
    const useSettings = await loadSettings();
    const s = useSettings.getState();
    expect(s.focusMode).toBe(true);
    expect(s.autoPair).toBe(true); // 默认
  });

  it("localStorage 损坏时回退默认值", async () => {
    localStorage.setItem("inkling-settings", "not json");
    const useSettings = await loadSettings();
    expect(useSettings.getState().autoPair).toBe(true);
  });

  it("setFormulaAutoNumber 切换并持久化", async () => {
    const useSettings = await loadSettings();
    useSettings.getState().setFormulaAutoNumber(true);
    expect(useSettings.getState().formulaAutoNumber).toBe(true);
    const persisted = JSON.parse(localStorage.getItem("inkling-settings")!);
    expect(persisted.formulaAutoNumber).toBe(true);
  });

  it("setCodeBlockTheme 设置并持久化", async () => {
    const useSettings = await loadSettings();
    useSettings.getState().setCodeBlockTheme("none");
    expect(useSettings.getState().codeBlockTheme).toBe("none");
    const persisted = JSON.parse(localStorage.getItem("inkling-settings")!);
    expect(persisted.codeBlockTheme).toBe("none");
  });

  it("setFocusMode / setTypewriterMode", async () => {
    const useSettings = await loadSettings();
    useSettings.getState().setFocusMode(true);
    useSettings.getState().setTypewriterMode(true);
    expect(useSettings.getState().focusMode).toBe(true);
    expect(useSettings.getState().typewriterMode).toBe(true);
  });

  it("setAutoPair / setSpellcheck", async () => {
    const useSettings = await loadSettings();
    useSettings.getState().setAutoPair(false);
    useSettings.getState().setSpellcheck(true);
    expect(useSettings.getState().autoPair).toBe(false);
    expect(useSettings.getState().spellcheck).toBe(true);
  });

  it("reset 全部回退默认值并清空持久化", async () => {
    const useSettings = await loadSettings();
    useSettings.getState().setFocusMode(true);
    useSettings.getState().setAutoPair(false);
    useSettings.getState().reset();
    const s = useSettings.getState();
    expect(s.focusMode).toBe(false);
    expect(s.autoPair).toBe(true);
    const persisted = JSON.parse(localStorage.getItem("inkling-settings")!);
    expect(persisted.focusMode).toBe(false);
    expect(persisted.autoPair).toBe(true);
  });

  it("修改一个字段时保留其他字段", async () => {
    const useSettings = await loadSettings();
    useSettings.getState().setFocusMode(true);
    useSettings.getState().setSpellcheck(true);
    const persisted = JSON.parse(localStorage.getItem("inkling-settings")!);
    expect(persisted.focusMode).toBe(true);
    expect(persisted.spellcheck).toBe(true);
    expect(persisted.autoPair).toBe(true); // 未改仍默认
  });

  it("editorZoom 默认 1，adjustEditorZoom 增量调整并持久化", async () => {
    const useSettings = await loadSettings();
    expect(useSettings.getState().editorZoom).toBe(1);
    useSettings.getState().adjustEditorZoom(0.2);
    expect(useSettings.getState().editorZoom).toBe(1.2);
    const persisted = JSON.parse(localStorage.getItem("inkling-settings")!);
    expect(persisted.editorZoom).toBe(1.2);
  });

  it("editorZoom 夹到 [0.5, 3] 范围并修正一位小数", async () => {
    const useSettings = await loadSettings();
    useSettings.getState().adjustEditorZoom(10); // 远超上限
    expect(useSettings.getState().editorZoom).toBe(3);
    useSettings.getState().resetEditorZoom();
    useSettings.getState().adjustEditorZoom(-10); // 远低于下限
    expect(useSettings.getState().editorZoom).toBe(0.5);
  });

  it("resetEditorZoom 恢复到 1", async () => {
    const useSettings = await loadSettings();
    useSettings.getState().setEditorZoom(2.5);
    useSettings.getState().resetEditorZoom();
    expect(useSettings.getState().editorZoom).toBe(1);
  });

  it("从 localStorage 恢复 editorZoom（含非法值回退默认）", async () => {
    localStorage.setItem(
      "inkling-settings",
      JSON.stringify({ editorZoom: 1.8 }),
    );
    const useSettings = await loadSettings();
    expect(useSettings.getState().editorZoom).toBe(1.8);
  });
});
