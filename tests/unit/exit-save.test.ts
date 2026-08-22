import { describe, it, expect, vi, beforeEach } from "vitest";
import { useWorkspace } from "../../src/store/workspace";

// mock fs
vi.mock("../../src/lib/fs", () => ({
  readTextFile: vi.fn(async () => "disk content"),
  writeTextFile: vi.fn(async () => {}),
  resolveAssetUrl: vi.fn((p: string) => p),
}));

describe("退出时批量保存与 Tab 还原逻辑", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspace.setState({
      activeTabPath: "/doc1.md",
      currentContent: "content 1",
      dirty: true,
      openTabs: [
        {
          path: "/doc1.md",
          content: "content 1 modified",
          diskContent: "content 1",
          dirty: true,
          lastSavedAt: null,
          cursorPos: null,
          scrollTop: null,
          revision: 0,
        },
        {
          path: "/doc2.md",
          content: "content 2 modified",
          diskContent: "content 2",
          dirty: true,
          lastSavedAt: null,
          cursorPos: null,
          scrollTop: null,
          revision: 0,
        },
      ],
    });
  });

  it("遍历保存所有 dirty tabs，并在取消时支持还原原 activeTab", async () => {
    const originalActive = useWorkspace.getState().activeTabPath;
    expect(originalActive).toBe("/doc1.md");

    const dirtyTabs = useWorkspace.getState().openTabs.filter((t) => t.dirty);
    expect(dirtyTabs.length).toBe(2);

    for (const tab of dirtyTabs) {
      useWorkspace.getState().switchTab(tab.path);
      await useWorkspace.getState().saveCurrent();
    }

    const latestTabs = useWorkspace.getState().openTabs;
    expect(latestTabs.every((t) => !t.dirty)).toBe(true);

    // 如果用户取消留在应用，可正确切回原 tab
    useWorkspace.getState().switchTab(originalActive!);
    expect(useWorkspace.getState().activeTabPath).toBe("/doc1.md");
  });
});
