import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSourceModeTransition } from "../../src/components/Editor/useSourceModeTransition";

describe("useSourceModeTransition", () => {
  it("enters source mode and initializes snapshot", () => {
    const filePath = "/tmp/test.md";
    const value = "# Title\n\nParagraph 1\n\nParagraph 2";
    const lastSyncedRef = { current: value };
    const getEditor = () => undefined;

    const { result, rerender } = renderHook(
      ({ sourceMode }) =>
        useSourceModeTransition({
          filePath,
          sourceMode,
          value,
          getEditor,
          lastSyncedRef,
        }),
      {
        initialProps: { sourceMode: false },
      },
    );

    // Initial state: not in source mode
    expect(result.current.enterSnapshot).toBeNull();

    // Simulate switching to source mode
    rerender({ sourceMode: true });

    // enterSnapshot should now be populated
    expect(result.current.enterSnapshot).toBeDefined();
    expect(result.current.enterSnapshot?.cursor).toBe(0);
    expect(result.current.enterSnapshot?.scrollTop).toBe(0);
  });

  it("handles exit snapshot restoring WYSIWYG editor state", () => {
    const filePath = "/tmp/test2.md";
    const value = "# Title\n\nParagraph 1\n\nParagraph 2";
    const lastSyncedRef = { current: value };

    let actionCalled = false;
    const mockView = {
      state: {
        plugins: [],
        doc: {
          content: { size: 10 },
          textBetween: () => "",
        },
        tr: {
          replaceWith: vi.fn().mockReturnThis(),
          setSelection: vi.fn().mockReturnThis(),
          setMeta: vi.fn().mockReturnThis(),
        },
      },
      dispatch: vi.fn(),
      dom: { closest: () => ({ scrollTop: 0 }) },
    };

    const mockEditor: any = {
      action: (fn: (ctx: any) => void) => {
        actionCalled = true;
        const mockCtx = {
          get: () => {
            return mockView;
          },
        };
        try {
          fn(mockCtx);
        } catch {
          // ignore inside mock test
        }
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
        }),
      {
        initialProps: { sourceMode: true },
      },
    );

    // In source mode, record exit snapshot
    act(() => {
      result.current.exitSnapshotRef.current = {
        cursor: 12,
        scrollTop: 150,
      };
    });

    // Switch back to WYSIWYG
    rerender({ sourceMode: false });

    expect(actionCalled).toBe(true);
    expect(result.current.exitSnapshotRef.current).toBeNull();
  });
});
