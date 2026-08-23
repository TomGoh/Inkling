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
    lastSavedAt: null,
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

  it("更新非活跃 tab 不动顶层 dirty 镜像", () => {
    useWorkspace.setState({
      openTabs: [tab("/a.md", "A"), tab("/b.md", "B")],
      activeTabPath: "/a.md",
      currentContent: "A",
      dirty: false,
    });

    useWorkspace.getState().setContentFor("/b.md", "B2");

    // 顶层 dirty 镜像活跃 tab：干净的活动文件不应显示未保存，
    // 也不应触发对无关文件的自动保存（PR #34 review P2）
    expect(useWorkspace.getState().dirty).toBe(false);
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

  it("setSplitContentFor 目标为当前分屏时同步分屏镜像", () => {
    useWorkspace.setState({
      openTabs: [tab("/a.md", "A"), tab("/b.md", "B")],
      activeTabPath: "/a.md",
      currentContent: "A",
      splitFile: "/b.md",
      splitContent: "B",
      dirty: false,
    });

    useWorkspace.getState().setSplitContentFor("/b.md", "B2");

    const s = useWorkspace.getState();
    expect(s.splitContent).toBe("B2");
    expect(s.openTabs.find((t) => t.path === "/b.md")?.content).toBe("B2");
  });

  it("setSplitContentFor 分屏已关闭时只写原 tab 不丢编辑", () => {
    useWorkspace.setState({
      openTabs: [tab("/a.md", "A"), tab("/b.md", "B")],
      activeTabPath: "/a.md",
      currentContent: "A",
      splitFile: null,
      splitContent: "",
      dirty: false,
    });

    useWorkspace.getState().setSplitContentFor("/b.md", "B2");

    const s = useWorkspace.getState();
    expect(s.openTabs.find((t) => t.path === "/b.md")?.content).toBe("B2");
    expect(s.splitContent).toBe("");
    expect(s.currentContent).toBe("A");
  });

  it("迟到 flush 指向新主文件时同步 currentContent 镜像", () => {
    // splitSwap 后原分屏文件成为活跃主文件：分屏侧迟到 flush 必须同步主镜像
    useWorkspace.setState({
      openTabs: [tab("/a.md", "A"), tab("/b.md", "B")],
      activeTabPath: "/b.md",
      currentContent: "B",
      splitFile: "/a.md",
      splitContent: "A",
      dirty: false,
    });

    useWorkspace.getState().setSplitContentFor("/b.md", "B2");

    const s = useWorkspace.getState();
    expect(s.currentContent).toBe("B2");
    expect(s.dirty).toBe(true);
    expect(s.openTabs.find((t) => t.path === "/b.md")?.content).toBe("B2");
  });

  it("主编辑器迟到 flush 指向新分屏文件时同步 splitContent 镜像", () => {
    useWorkspace.setState({
      openTabs: [tab("/a.md", "A"), tab("/b.md", "B")],
      activeTabPath: "/b.md",
      currentContent: "B",
      splitFile: "/a.md",
      splitContent: "A",
      dirty: false,
    });

    useWorkspace.getState().setContentFor("/a.md", "A2");

    expect(useWorkspace.getState().splitContent).toBe("A2");
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
