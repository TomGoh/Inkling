// 源代码模式标签页状态测试（issue #19）

import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspace, type OpenTab } from "../../src/store/workspace";

function tab(path: string): OpenTab {
  return {
    path,
    content: `# ${path}`,
    dirty: false,
    lastSavedAt: null,
    cursorPos: null,
    scrollTop: null,
  };
}

beforeEach(() => {
  useWorkspace.setState({
    openTabs: [tab("/a.md"), tab("/b.md")],
    activeTabPath: "/a.md",
    currentFile: "/a.md",
    currentContent: "# /a.md",
  });
});

describe("源代码模式 tab 状态", () => {
  it("setTabSourceMode(true) 后 getTabSourceMode() 为 true", () => {
    useWorkspace.getState().setTabSourceMode(true);
    expect(useWorkspace.getState().getTabSourceMode()).toBe(true);
    expect(useWorkspace.getState().getTabSourceMode("/a.md")).toBe(true);
    expect(useWorkspace.getState().getTabSourceMode("/b.md")).toBe(false);
  });

  it("切换 tab 后各 tab 独立记忆 sourceMode", () => {
    useWorkspace.getState().setTabSourceMode(true, "/a.md");
    useWorkspace.getState().setTabSourceMode(true, "/b.md");
    useWorkspace.getState().switchTab("/a.md");
    expect(useWorkspace.getState().getTabSourceMode()).toBe(true);
    useWorkspace.getState().switchTab("/b.md");
    expect(useWorkspace.getState().getTabSourceMode()).toBe(true);
    useWorkspace.getState().setTabSourceMode(false, "/b.md");
    useWorkspace.getState().switchTab("/a.md");
    expect(useWorkspace.getState().getTabSourceMode()).toBe(true);
    useWorkspace.getState().switchTab("/b.md");
    expect(useWorkspace.getState().getTabSourceMode()).toBe(false);
  });

  it("toggleTabSourceMode 切换当前 tab", () => {
    expect(useWorkspace.getState().getTabSourceMode()).toBe(false);
    useWorkspace.getState().toggleTabSourceMode();
    expect(useWorkspace.getState().getTabSourceMode()).toBe(true);
    useWorkspace.getState().toggleTabSourceMode();
    expect(useWorkspace.getState().getTabSourceMode()).toBe(false);
  });

  it("关闭 tab 再打开同一文件，sourceMode 重置为 false", () => {
    useWorkspace.getState().setTabSourceMode(true, "/a.md");
    useWorkspace.getState().closeTab("/a.md");
    useWorkspace.setState({
      openTabs: [tab("/a.md")],
      activeTabPath: "/a.md",
      currentFile: "/a.md",
    });
    expect(useWorkspace.getState().getTabSourceMode("/a.md")).toBe(false);
  });
});
