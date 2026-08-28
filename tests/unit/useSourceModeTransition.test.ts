import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSourceModeTransition } from "../../src/components/Editor/useSourceModeTransition";
import { editorViewCtx, parserCtx } from "@milkdown/kit/core";
import { registerSourceModeScroll, unregisterSourceModeScroll } from "../../src/lib/source-mode-scroll";
import { markdownOffsetToProsePos } from "../../src/lib/source-mode-cursor";
import { useWorkspace } from "../../src/store/workspace";

describe("useSourceModeTransition", () => {
  it("enters source mode and captures non-zero cursor & scroll snapshot from WYSIWYG editor", () => {
    const filePath = "/tmp/test-enter.md";
    const value = "# Title\n\nParagraph 1\n\nParagraph 2";
    const lastSyncedRef = { current: value };

    const mockView = {
      state: {
        selection: { head: 15 },
        doc: {
          textBetween: (_from: number, _to: number) => "# Title\n\nParagraph",
        },
      },
      dom: {
        closest: (selector: string) => {
          if (selector === ".editor-scroll") {
            return { scrollTop: 120, isConnected: true };
          }
          return null;
        },
      },
    };

    const mockEditor: any = {
      action: (fn: (ctx: any) => void) => {
        const mockCtx = {
          get: (key: any) => {
            if (key === editorViewCtx) return mockView;
            return null;
          },
        };
        fn(mockCtx);
      },
    };

    const { result, rerender } = renderHook(
      ({ sourceMode }) =>
        useSourceModeTransition({
          filePath,
          sourceMode,
          value,
          getEditor: () => mockEditor,
          lastSyncedRef,
          getWysiwygScrollTop: () => 120,
        }),
      {
        initialProps: { sourceMode: false },
      },
    );

    expect(result.current.enterSnapshot).toBeNull();

    // Switch to source mode
    rerender({ sourceMode: true });

    expect(result.current.enterSnapshot).not.toBeNull();
    expect(result.current.enterSnapshot?.cursor).toBeGreaterThan(0);
    expect(result.current.enterSnapshot?.scrollTop).toBe(120);
  });

  it("handles exit snapshot and restores PM selection & scroll position", async () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    const originalRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    };

    const filePath = "/tmp/test-exit.md";
    const value = "# Title\n\nParagraph 1\n\nParagraph 2";
    const lastSyncedRef = { current: value };

    // finalize 校正链路所需几何信息：布局高 80、zoom=1（rect.height=clientHeight）
    const mockScrollEl = {
      scrollTop: 0,
      isConnected: true,
      scrollHeight: 200,
      clientHeight: 80,
      getBoundingClientRect: () => ({ top: 20, height: 80 }),
    };
    Object.setPrototypeOf(mockScrollEl, HTMLElement.prototype);

    const mockTr = {
      replaceWith: vi.fn().mockReturnThis(),
      setSelection: vi.fn().mockReturnThis(),
      setMeta: vi.fn().mockReturnThis(),
    };

    const mockView = {
      state: {
        plugins: [],
        doc: {
          content: { size: 40 },
          resolve: vi.fn().mockReturnValue({ pos: 18 }),
          textBetween: () => "",
        },
        selection: { head: 18 },
        tr: mockTr,
      },
      dispatch: vi.fn(),
      // 视口坐标（zoom=1）：视口偏移 40/41 → 内容偏移 140/141，
      // 落在 [scrollTop+8, scrollTop+72] = [108, 172] 可视区间内 → finalize 不调整
      coordsAtPos: () => ({ top: 60, bottom: 61 }),
      dom: {
        closest: (selector: string) => {
          if (selector === ".editor-scroll") {
            return mockScrollEl;
          }
          return null;
        },
      },
    };

    const mockEditor: any = {
      action: (fn: (ctx: any) => void) => {
        const mockCtx = {
          get: (key: any) => {
            if (key === editorViewCtx) return mockView;
            if (key === parserCtx) return (val: string) => ({ content: { size: val.length } });
            return null;
          },
        };
        fn(mockCtx);
      },
    };

    // 注册活跃 CodeMirror 滚动获取实例
    registerSourceModeScroll(filePath, {
      scrollToHeading: vi.fn(),
      getScrollAndCursor: () => ({
        cursor: 18,
        scrollTop: 50,
        scrollHeight: 100,
      }),
    });

    // 预置 tab 记忆（含进入源码模式前的旧值），验证退出后写回覆盖
    useWorkspace.setState({
      openTabs: [
        { path: filePath, content: value, dirty: false, lastSavedAt: null, cursorPos: 3, scrollTop: 0 },
      ],
    });

    const { rerender } = renderHook(
      ({ sourceMode }) =>
        useSourceModeTransition({
          filePath,
          sourceMode,
          value,
          getEditor: () => mockEditor,
          lastSyncedRef,
        }),
      {
        initialProps: { sourceMode: true },
      },
    );

    // Switch back to WYSIWYG mode
    rerender({ sourceMode: false });

    // Flush all nested requestAnimationFrames
    while (rafCallbacks.length > 0) {
      const cb = rafCallbacks.shift();
      cb?.(0);
    }

    // Verify PM transaction replaced content and restored selection
    expect(mockTr.replaceWith).toHaveBeenCalled();
    expect(mockView.dispatch).toHaveBeenCalled();
    // 比例映射：source 50/100 → target 200 期望映射为 100
    expect(mockScrollEl.scrollTop).toBe(100);

    // 退出恢复后写回 tab 记忆（#136 单一事实源）：光标为映射后的 PM pos，
    // 滚动为映射目标值，覆盖进入源码模式前的旧值（cursorPos 3 / scrollTop 0）
    const expectedPos = markdownOffsetToProsePos(40, value, 18);
    const saved = useWorkspace.getState().getCursorStateFor(filePath);
    expect(saved.pos).toBe(expectedPos);
    expect(saved.scrollTop).toBe(100);

    unregisterSourceModeScroll(filePath);
    window.requestAnimationFrame = originalRaf;
  });

  it("finalize 校正在 editorZoom != 100% 时统一坐标系：视口偏移换算回布局单位（#138 review）", async () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    const originalRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    };

    const filePath = "/tmp/test-exit-zoom.md";
    const value = "# Title\n\nParagraph 1\n\nParagraph 2";
    const lastSyncedRef = { current: value };

    // zoom=1.25（rect.height=1000 / clientHeight=800）：视口坐标是布局坐标的 1.25 倍
    const mockScrollEl = {
      scrollTop: 0,
      isConnected: true,
      scrollHeight: 2000,
      clientHeight: 800,
      getBoundingClientRect: () => ({ top: 50, height: 1000 }),
    };
    Object.setPrototypeOf(mockScrollEl, HTMLElement.prototype);

    const mockTr = {
      replaceWith: vi.fn().mockReturnThis(),
      setSelection: vi.fn().mockReturnThis(),
      setMeta: vi.fn().mockReturnThis(),
    };

    const mockView = {
      state: {
        plugins: [],
        doc: {
          content: { size: 40 },
          resolve: vi.fn().mockReturnValue({ pos: 18 }),
          textBetween: () => "",
        },
        selection: { head: 18 },
        tr: mockTr,
      },
      dispatch: vi.fn(),
      // 光标内容偏移 1450/1451（折叠线下方）：视口坐标 =
      // rect.top + (内容偏移 − scrollTop) × 1.25 = 50 + 950 × 1.25 = 1237.5
      coordsAtPos: () => ({ top: 1237.5, bottom: 1238.75 }),
      dom: {
        closest: (selector: string) => {
          if (selector === ".editor-scroll") {
            return mockScrollEl;
          }
          return null;
        },
      },
    };

    const mockEditor: any = {
      action: (fn: (ctx: any) => void) => {
        const mockCtx = {
          get: (key: any) => {
            if (key === editorViewCtx) return mockView;
            if (key === parserCtx) return (val: string) => ({ content: { size: val.length } });
            return null;
          },
        };
        fn(mockCtx);
      },
    };

    registerSourceModeScroll(filePath, {
      scrollToHeading: vi.fn(),
      getScrollAndCursor: () => ({
        cursor: 18,
        scrollTop: 250,
        scrollHeight: 1000,
      }),
    });

    useWorkspace.setState({
      openTabs: [
        { path: filePath, content: value, dirty: false, lastSavedAt: null, cursorPos: 3, scrollTop: 0 },
      ],
    });

    const { rerender } = renderHook(
      ({ sourceMode }) =>
        useSourceModeTransition({
          filePath,
          sourceMode,
          value,
          getEditor: () => mockEditor,
          lastSyncedRef,
        }),
      {
        initialProps: { sourceMode: true },
      },
    );

    rerender({ sourceMode: false });

    while (rafCallbacks.length > 0) {
      const cb = rafCallbacks.shift();
      cb?.(0);
    }

    // 比例映射目标 250/1000×2000 = 500；光标内容偏移 1451 超出
    // [508, 1292] 可视区间 → 最小滚动校正 = 1451 + 8 − 800 = 659。
    // 若混用坐标系（视口值直接当布局值）会得到 942 或 896.75 之类的错误值
    expect(mockScrollEl.scrollTop).toBe(659);
    const saved = useWorkspace.getState().getCursorStateFor(filePath);
    expect(saved.scrollTop).toBe(659);

    unregisterSourceModeScroll(filePath);
    window.requestAnimationFrame = originalRaf;
  });
});
