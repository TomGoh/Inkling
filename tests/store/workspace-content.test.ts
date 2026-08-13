// setContentFor 测试
// 验证：异步发布绑定文件路径，tab 切换/销毁期 flush 不会串写到其他 tab（PR #34 review）

import { describe, expect, it } from "vitest";
import { useWorkspace, type OpenTab } from "../../src/store/workspace";

function tab(path: string, content: string): OpenTab {
  return {
    path,
    content,
    cursorPos: null,
    scrollTop: null,
    dirty: false,
    isUntitled: false,
  };
}

describe("workspace.setContentFor", () => {
  it("更新指定 tab，不串写活跃 tab", () => {
    useWorkspace.setState({
      openTabs: [tab("/a.md", "A"), tab("/b.md", "B")],
      activeTabPath: "/a.md",
      currentContent: "A",
      dirty: false,
    });

    useWorkspace.getState().setContentFor("/b.md", "B2");

    const { openTabs, currentContent } = useWorkspace.getState();
    expect(openTabs.find((t) => t.path === "/b.md")?.content).toBe("B2");
    expect(openTabs.find((t) => t.path === "/b.md")?.dirty).toBe(true);
    // 活跃 tab 与顶层 currentContent 不受影响
    expect(openTabs.find((t) => t.path === "/a.md")?.content).toBe("A");
    expect(currentContent).toBe("A");
  });

  it("目标为活跃 tab 时同步顶层 currentContent", () => {
    useWorkspace.setState({
      openTabs: [tab("/a.md", "A"), tab("/b.md", "B")],
      activeTabPath: "/a.md",
      currentContent: "A",
      dirty: false,
    });

    useWorkspace.getState().setContentFor("/a.md", "A2");

    expect(useWorkspace.getState().currentContent).toBe("A2");
  });

  it("相同内容不触发更新", () => {
    useWorkspace.setState({
      openTabs: [tab("/a.md", "A")],
      activeTabPath: "/a.md",
      currentContent: "A",
      dirty: false,
    });

    useWorkspace.getState().setContentFor("/a.md", "A");

    expect(useWorkspace.getState().dirty).toBe(false);
  });

  it("tab 已关闭时 no-op", () => {
    useWorkspace.setState({
      openTabs: [tab("/a.md", "A")],
      activeTabPath: "/a.md",
      currentContent: "A",
      dirty: false,
    });

    useWorkspace.getState().setContentFor("/gone.md", "x");

    const s = useWorkspace.getState();
    expect(s.openTabs).toHaveLength(1);
    expect(s.openTabs[0].content).toBe("A");
  });
});
