import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenTab } from "../../src/store/workspace";

const { isTauriMock, saveMock, writeTextFileMock, fileMtimeMock } = vi.hoisted(() => ({
  isTauriMock: vi.fn(() => true),
  saveMock: vi.fn(),
  writeTextFileMock: vi.fn(),
  fileMtimeMock: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: isTauriMock }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: saveMock, ask: vi.fn() }));
vi.mock("../../src/lib/fs", () => ({
  writeTextFile: writeTextFileMock,
  readTextFile: vi.fn(),
  fileMtime: fileMtimeMock,
}));

import { useWorkspace } from "../../src/store/workspace";

const untitledPath = "untitled-testing";
function untitled(content = "draft"): OpenTab {
  return {
    path: untitledPath,
    content,
    dirty: true,
    isUntitled: true,
    lastSavedAt: null,
    cursorPos: null,
    scrollTop: null,
  };
}

function reset(content = "draft") {
  useWorkspace.setState({
    openTabs: [untitled(content)],
    activeTabPath: untitledPath,
    currentFile: untitledPath,
    currentContent: content,
    dirty: true,
    saving: false,
    saveError: null,
    recentFiles: [],
  });
}

describe("saveCurrent untitled first-save migration", () => {
  beforeEach(() => {
    saveMock.mockReset().mockResolvedValue("/docs/saved.md");
    writeTextFileMock.mockReset().mockResolvedValue(undefined);
    fileMtimeMock.mockReset().mockResolvedValue(1_234);
    isTauriMock.mockReturnValue(true);
    localStorage.clear();
    reset();
  });

  it("writes the selected path and migrates all active tab mirrors", async () => {
    await useWorkspace.getState().saveCurrent();
    expect(writeTextFileMock).toHaveBeenCalledWith("/docs/saved.md", "draft");
    const state = useWorkspace.getState();
    expect(state.activeTabPath).toBe("/docs/saved.md");
    expect(state.currentFile).toBe("/docs/saved.md");
    expect(state.openTabs[0]).toMatchObject({
      path: "/docs/saved.md", isUntitled: false, dirty: false, diskMtime: 1_234,
    });
    expect(state.recentFiles).toContain("/docs/saved.md");
  });

  it("keeps the untitled tab dirty when the dialog is cancelled", async () => {
    saveMock.mockResolvedValue(null);
    await useWorkspace.getState().saveCurrent();
    expect(writeTextFileMock).not.toHaveBeenCalled();
    expect(useWorkspace.getState().openTabs[0]).toMatchObject({
      path: untitledPath, isUntitled: true, dirty: true,
    });
  });

  it("can retry after a write failure", async () => {
    writeTextFileMock.mockRejectedValueOnce(new Error("permission denied"));
    await useWorkspace.getState().saveCurrent();
    expect(useWorkspace.getState().saveError).toBe("permission denied");
    expect(useWorkspace.getState().openTabs[0].isUntitled).toBe(true);
    await useWorkspace.getState().saveCurrent();
    expect(writeTextFileMock).toHaveBeenCalledTimes(2);
    expect(useWorkspace.getState().activeTabPath).toBe("/docs/saved.md");
  });

  it("keeps later edits dirty while the first write is pending", async () => {
    let release!: () => void;
    writeTextFileMock.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const saving = useWorkspace.getState().saveCurrent();
    await vi.waitFor(() => expect(writeTextFileMock).toHaveBeenCalled());
    useWorkspace.getState().setContent("draft plus later edit");
    release();
    await saving;
    expect(useWorkspace.getState().currentContent).toBe("draft plus later edit");
    expect(useWorkspace.getState().dirty).toBe(true);
  });

  it("does not open a dialog during non-interactive auto-save", async () => {
    await useWorkspace.getState().saveCurrent({ interactive: false });
    expect(saveMock).not.toHaveBeenCalled();
    expect(writeTextFileMock).not.toHaveBeenCalled();
    expect(useWorkspace.getState().dirty).toBe(true);
  });
});
