import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useFileWatcher } from "../../src/lib/useFileWatcher";
import { useWorkspace } from "../../src/store/workspace";
import { useConflict } from "../../src/store/conflict";
import * as fs from "../../src/lib/fs";
import * as tauriCore from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(),
}));

vi.mock("../../src/lib/fs", () => ({
  fileMtime: vi.fn(),
  readTextFile: vi.fn(),
}));

describe("useFileWatcher & deletedOnDisk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tauriCore.isTauri).mockReturnValue(true);

    useWorkspace.setState({
      openTabs: [
        {
          path: "/workspace/doc1.md",
          content: "# Doc 1",
          dirty: false,
          diskMtime: 1000,
          deletedOnDisk: false,
          lastSavedAt: null,
          cursorPos: 0,
          scrollTop: 0,
        },
        {
          path: "/workspace/doc2.md",
          content: "# Doc 2",
          dirty: false,
          diskMtime: 1000,
          deletedOnDisk: false,
          lastSavedAt: null,
          cursorPos: 0,
          scrollTop: 0,
        },
      ],
      currentFile: "/workspace/doc1.md",
      currentContent: "# Doc 1",
      dirty: false,
    });
    useConflict.setState({ conflict: null });
  });

  it("marks tab as deletedOnDisk when fileMtime throws error", async () => {
    vi.mocked(fs.fileMtime).mockImplementation(async (path: string) => {
      if (path === "/workspace/doc2.md") {
        throw new Error("File not found");
      }
      return 1000;
    });

    renderHook(() => useFileWatcher());

    // Trigger focus to execute check
    window.dispatchEvent(new Event("focus"));

    await vi.waitFor(() => {
      const tabs = useWorkspace.getState().openTabs;
      const tab2 = tabs.find((t) => t.path === "/workspace/doc2.md");
      expect(tab2?.deletedOnDisk).toBe(true);
      const tab1 = tabs.find((t) => t.path === "/workspace/doc1.md");
      expect(tab1?.deletedOnDisk).toBe(false);
    });
  });

  it("switchTab verifies file presence on disk", async () => {
    vi.mocked(fs.fileMtime).mockRejectedValueOnce(new Error("ENOENT"));

    useWorkspace.getState().switchTab("/workspace/doc2.md");

    await vi.waitFor(() => {
      const tab2 = useWorkspace.getState().openTabs.find((t) => t.path === "/workspace/doc2.md");
      expect(tab2?.deletedOnDisk).toBe(true);
    });
  });
});
