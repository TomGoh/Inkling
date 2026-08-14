// 编辑位置记忆按文件路径读写测试（issue #30）
// 验证：saveCursorState 绑定文件路径，切 tab 后旧编辑器的销毁期 flush
// 不会把旧文件的 cursor/scrollTop 串写到新激活 tab

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
    dirty: false,
  });
});

describe("workspace.saveCursorState（路径绑定，issue #30）", () => {
  it("写入指定 tab，不依赖 activeTabPath", () => {
    // 模拟切 tab 时序：store 已把 activeTabPath 切到 /b.md，
    // 旧编辑器（/a.md）销毁期 flush 此时才落盘
    useWorkspace.setState({ activeTabPath: "/b.md", currentFile: "/b.md" });

    useWorkspace.getState().saveCursorState("/a.md", 42, 1200);

    const { openTabs } = useWorkspace.getState();
    expect(openTabs.find((t) => t.path === "/a.md")?.cursorPos).toBe(42);
    expect(openTabs.find((t) => t.path === "/a.md")?.scrollTop).toBe(1200);
    // 新激活 tab 不被串写
    expect(openTabs.find((t) => t.path === "/b.md")?.cursorPos).toBeNull();
    expect(openTabs.find((t) => t.path === "/b.md")?.scrollTop).toBeNull();
  });

  it("未知路径直接忽略", () => {
    useWorkspace.getState().saveCursorState("/gone.md", 1, 2);
    expect(useWorkspace.getState().openTabs).toHaveLength(2);
  });

  it("相同值不产生新 openTabs 引用（避免订阅组件重渲染）", () => {
    const before = useWorkspace.getState().openTabs;
    useWorkspace.getState().saveCursorState("/a.md", 10, 100);
    const middle = useWorkspace.getState().openTabs;
    expect(middle).not.toBe(before);

    useWorkspace.getState().saveCursorState("/a.md", 10, 100);
    expect(useWorkspace.getState().openTabs).toBe(middle);
  });
});

describe("workspace.getCursorStateFor（路径读取，issue #30）", () => {
  it("按路径返回记忆值", () => {
    useWorkspace.getState().saveCursorState("/b.md", 7, 300);
    // 活跃 tab 仍是 /a.md，读取 /b.md 不受影响
    expect(useWorkspace.getState().getCursorStateFor("/b.md")).toEqual({
      pos: 7,
      scrollTop: 300,
    });
  });

  it("无记忆值返回 null", () => {
    expect(useWorkspace.getState().getCursorStateFor("/a.md")).toEqual({
      pos: null,
      scrollTop: null,
    });
  });

  it("未知路径返回 null", () => {
    expect(useWorkspace.getState().getCursorStateFor("/nope.md")).toEqual({
      pos: null,
      scrollTop: null,
    });
  });
});
