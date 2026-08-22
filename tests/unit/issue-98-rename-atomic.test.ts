import { describe, it, expect } from "vitest";
import { useWorkspace } from "../../src/store/workspace";

describe("Issue #98: Rename state migration", () => {
  it("should atomically rename tabs and bookmarks", () => {
    useWorkspace.setState({
      openTabs: [{ path: "/old/file.md", content: "hello", dirty: false, lastSavedAt: null, cursorPos: null, scrollTop: null }],
      activeTabPath: "/old/file.md",
      currentFile: "/old/file.md",
      bookmarks: ["/old/file.md"],
      expandedDirs: new Set(["/old"]),
    });

    useWorkspace.getState().onFileRenamed("/old/file.md", "/new/file.md");

    const state = useWorkspace.getState();
    expect(state.openTabs[0].path).toBe("/new/file.md");
    expect(state.currentFile).toBe("/new/file.md");
    expect(state.bookmarks).toContain("/new/file.md");
    expect(state.bookmarks).not.toContain("/old/file.md");
  });
});
