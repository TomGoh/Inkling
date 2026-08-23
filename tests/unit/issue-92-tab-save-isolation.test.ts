import { describe, it, expect, vi } from "vitest";
import { useWorkspace } from "../../src/store/workspace";
import * as fsLib from "../../src/lib/fs";

describe("Issue #92: Tab save isolation and cross-tab error isolation", () => {
  it("should only update status of the saving tab", async () => {
    useWorkspace.setState({
      openTabs: [
        { path: "/a.md", content: "tab 1 content", dirty: false, lastSavedAt: null, cursorPos: null, scrollTop: null },
        { path: "/b.md", content: "tab 2 content", dirty: true, lastSavedAt: null, cursorPos: null, scrollTop: null },
      ],
      activeTabPath: "/b.md",
      currentFile: "/b.md",
      currentContent: "tab 2 content",
      dirty: true,
      saving: false,
      saveError: null,
    });

    vi.spyOn(fsLib, "writeTextFile").mockResolvedValue(undefined);
    await useWorkspace.getState().saveCurrent();

    const tabs = useWorkspace.getState().openTabs;
    expect(tabs.find(t => t.path === "/b.md")?.dirty).toBe(false);
  });

  it("should not leak saveError to Tab B when Tab A fails to save after switching to Tab B", async () => {
    useWorkspace.setState({
      openTabs: [
        { path: "/a.md", content: "content A", dirty: true, lastSavedAt: null, cursorPos: null, scrollTop: null },
        { path: "/b.md", content: "content B", dirty: false, lastSavedAt: null, cursorPos: null, scrollTop: null },
      ],
      activeTabPath: "/a.md",
      currentFile: "/a.md",
      currentContent: "content A",
      dirty: true,
      saving: false,
      saveError: null,
    });

    let rejectWrite: (err: any) => void;
    const writePromise = new Promise<void>((_, reject) => {
      rejectWrite = reject;
    });

    vi.spyOn(fsLib, "writeTextFile").mockImplementation(() => writePromise);

    // 开始保存 A
    const savePromise = useWorkspace.getState().saveCurrent();

    // 在保存过程中用户切换到了 Tab B
    useWorkspace.setState({
      activeTabPath: "/b.md",
      currentFile: "/b.md",
      currentContent: "content B",
      dirty: false,
    });

    // 此时 A 保存失败
    rejectWrite!(new Error("Disk IO failure on Tab A"));
    await savePromise;

    // 因为当前激活的 Tab 已经是 /b.md，顶层的 saveError 不应该被设置/污染为 A 的错误
    expect(useWorkspace.getState().saveError).toBeNull();
    // 全局 saving 状态必须已被释放
    expect(useWorkspace.getState().saving).toBe(false);
  });
});
