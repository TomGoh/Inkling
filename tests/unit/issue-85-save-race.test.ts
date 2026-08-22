import { describe, it, expect, beforeEach, vi } from "vitest";
import { useWorkspace } from "../../src/store/workspace";
import * as fsLib from "../../src/lib/fs";

describe("Issue #85: saveCurrent dirty state race condition", () => {
  beforeEach(() => {
    useWorkspace.setState({
      openTabs: [{ path: "/test/doc.md", content: "initial content", dirty: true, lastSavedAt: null, cursorPos: null, scrollTop: null }],
      currentFile: "/test/doc.md",
      currentContent: "initial content",
      saving: false,
    });
  });

  it("should not clear dirty flag if new edits occurred during saving", async () => {
    let resolveWrite: () => void;
    const writePromise = new Promise<void>((r) => { resolveWrite = r; });
    
    vi.spyOn(fsLib, "writeTextFile").mockImplementation(async () => {
      // Simulate user editing while write is pending
      useWorkspace.getState().setContent("new edits during save");
      return writePromise;
    });

    const savePromise = useWorkspace.getState().saveCurrent();
    resolveWrite!();
    await savePromise;

    // Content was edited during save, tab must remain dirty
    const activeTab = useWorkspace.getState().openTabs.find((t) => t.path === "/test/doc.md");
    expect(activeTab?.dirty).toBe(true);
  });
});
