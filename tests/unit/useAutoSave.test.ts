import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAutoSave } from "../../src/lib/useAutoSave";
import { useWorkspace } from "../../src/store/workspace";

vi.mock("../../src/components/Editor/markdown-publisher", () => ({
  flushAllMarkdownPublishers: vi.fn(),
}));

describe("useAutoSave hook", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useWorkspace.setState({
      dirty: false,
      saving: false,
      currentFile: "/path/to/test.md",
      activeTabPath: "/path/to/test.md",
      openTabs: [{ path: "/path/to/test.md", content: "", dirty: false, isUntitled: false, cursorPos: null, scrollTop: null, lastSavedAt: null }],
      saveCurrent: vi.fn().mockResolvedValue(undefined),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should auto save after debounce when dirty becomes true for normal file", async () => {
    const saveCurrentMock = vi.fn().mockResolvedValue(undefined);
    useWorkspace.setState({ saveCurrent: saveCurrentMock });

    const { rerender } = renderHook(() => useAutoSave());

    // 变脏
    useWorkspace.setState({ dirty: true });
    rerender();

    expect(saveCurrentMock).not.toHaveBeenCalled();

    // 前进 1999ms 不应触发
    vi.advanceTimersByTime(1999);
    expect(saveCurrentMock).not.toHaveBeenCalled();

    // 达到 2000ms 触发
    vi.advanceTimersByTime(1);
    expect(saveCurrentMock).toHaveBeenCalledTimes(1);
  });

  it("should NOT auto save if active tab is untitled", async () => {
    const saveCurrentMock = vi.fn().mockResolvedValue(undefined);
    useWorkspace.setState({
      saveCurrent: saveCurrentMock,
      activeTabPath: "untitled-1",
      currentFile: null,
      openTabs: [{ path: "untitled-1", content: "", dirty: true, isUntitled: true, cursorPos: null, scrollTop: null, lastSavedAt: null }],
      dirty: true,
    });

    renderHook(() => useAutoSave());
    vi.advanceTimersByTime(2500);

    expect(saveCurrentMock).not.toHaveBeenCalled();
  });

  it("should trigger immediate save on Ctrl+S", async () => {
    const saveCurrentMock = vi.fn().mockResolvedValue(undefined);
    useWorkspace.setState({ saveCurrent: saveCurrentMock });

    renderHook(() => useAutoSave());

    const event = new KeyboardEvent("keydown", {
      key: "s",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(saveCurrentMock).toHaveBeenCalledTimes(1);
  });
});
