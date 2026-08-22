import { describe, it, expect, vi } from "vitest";
import { useWorkspace } from "../../src/store/workspace";
import * as fsLib from "../../src/lib/fs";

describe("Issue #87: reloadFile safe error handling", () => {
  it("should not throw unhandled rejection when file is missing on reload", async () => {
    useWorkspace.setState({
      openTabs: [{ path: "/deleted.md", content: "", dirty: false, lastSavedAt: null, cursorPos: null, scrollTop: null }],
      currentFile: "/deleted.md",
    });
    vi.spyOn(fsLib, "readTextFile").mockRejectedValue(new Error("File not found"));
    
    await expect(useWorkspace.getState().reloadFile("/deleted.md")).resolves.not.toThrow();
  });
});
