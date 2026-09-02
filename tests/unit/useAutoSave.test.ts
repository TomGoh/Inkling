import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
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

  // ===== issue #149：冲突态暂停自动保存，避免 2s 空转 IO 风暴 =====

  it("should pause auto save while conflictPending is true", async () => {
    const saveCurrentMock = vi.fn().mockResolvedValue(undefined);
    useWorkspace.setState({
      saveCurrent: saveCurrentMock,
      dirty: true,
      conflictPending: true,
    });

    const { rerender } = renderHook(() => useAutoSave());
    rerender();

    // 冲突待处理期间：远超常规 2s 防抖也不触发自动保存
    vi.advanceTimersByTime(10000);
    expect(saveCurrentMock).not.toHaveBeenCalled();

    // 用户处理完冲突（conflictPending 清除）后恢复自动保存
    useWorkspace.setState({ conflictPending: false });
    rerender();
    vi.advanceTimersByTime(2000);
    expect(saveCurrentMock).toHaveBeenCalledTimes(1);
    expect(saveCurrentMock).toHaveBeenCalledWith({ interactive: false });
  });

  it("should maintain exponential backoff per file, not globally", async () => {
    // 真实 store 的 saveCurrent：失败时在返回前把 saveError 置位、dirty 保持 true；
    // 成功则清空 saveError 并置 dirty=false。文件 A 恒失败、文件 B 恒成功
    const saveCurrentMock = vi.fn(async () => {
      useWorkspace.setState({ saving: true });
      await Promise.resolve();
      const s = useWorkspace.getState();
      if (s.currentFile === "/docs/a.md") {
        useWorkspace.setState({ saving: false, saveError: "disk full" });
      } else {
        useWorkspace.setState({ saving: false, saveError: null, dirty: false });
      }
    });
    useWorkspace.setState({
      saveCurrent: saveCurrentMock,
      dirty: true,
      currentFile: "/docs/a.md",
      activeTabPath: "/docs/a.md",
      openTabs: [
        { path: "/docs/a.md", content: "A 内容", dirty: true, isUntitled: false, cursorPos: null, scrollTop: null, lastSavedAt: null },
      ],
    });

    const { rerender } = renderHook(() => useAutoSave());
    rerender();

    // 让文件 A 连续失败若干轮，累积退避计数。
    // 合并 PR #194 的 retryRevision 后退避严格生效：尝试点为 t=2s（fails=0 基线）、
    // t=6s（fails=1 → 4s）、t=14s（fails=2 → 8s），12s 内仅触发 2 次。
    // 旧实现首次失败后的重试会以过早调度的 2s 基线定时器提前触发（12s 内 3 次），
    // 即 #194 修复的「退避状态更新过晚」问题。
    for (let round = 0; round < 4; round++) {
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
    }
    const callsAfterA = saveCurrentMock.mock.calls.length;
    expect(callsAfterA).toBe(2);
    expect(useWorkspace.getState().saveError).toBe("disk full");

    // 切换到文件 B：failCount 按文件隔离 → B 仍以 2s 基线触发。
    // 旧行为（全局共享 failCount）：B 会继承 A 的退避（≥4s），1999ms 与 2000ms 都不会触发
    await act(async () => {
      useWorkspace.setState({
        saveError: null,
        dirty: true,
        currentFile: "/docs/b.md",
        activeTabPath: "/docs/b.md",
        openTabs: [
          { path: "/docs/a.md", content: "A 内容", dirty: true, isUntitled: false, cursorPos: null, scrollTop: null, lastSavedAt: null },
          { path: "/docs/b.md", content: "B 内容", dirty: true, isUntitled: false, cursorPos: null, scrollTop: null, lastSavedAt: null },
        ],
      });
      rerender();
    });
    await act(async () => {
      vi.advanceTimersByTime(1999);
    });
    expect(saveCurrentMock).toHaveBeenCalledTimes(callsAfterA);
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(saveCurrentMock).toHaveBeenCalledTimes(callsAfterA + 1);

    // B 保存成功：状态干净
    expect(useWorkspace.getState().dirty).toBe(false);
    expect(useWorkspace.getState().saveError).toBeNull();
  });
});
