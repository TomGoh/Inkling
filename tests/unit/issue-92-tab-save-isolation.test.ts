import { describe, it, expect, vi } from "vitest";
import { useWorkspace } from "../../src/store/workspace";
import * as fsLib from "../../src/lib/fs";

describe("Issue #92: Tab save isolation", () => {
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
    });

    vi.spyOn(fsLib, "writeTextFile").mockResolvedValue(undefined);
    await useWorkspace.getState().saveCurrent();

    const tabs = useWorkspace.getState().openTabs;
    expect(tabs.find(t => t.path === "/b.md")?.dirty).toBe(false);
  });
});
