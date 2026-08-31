import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { GlobalSearchPanel } from "../../src/components/GlobalSearch/GlobalSearchPanel";
import { useWorkspace } from "../../src/store/workspace";
import * as fsApi from "../../src/lib/fs";

describe("GlobalSearchPanel race condition guards (Issue #126)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useWorkspace.setState({
      rootPath: "/test/workspace",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("ignores older in-flight search results when a newer search finishes", async () => {
    let resolveFirst: (value: any) => void = () => {};
    const firstPromise = new Promise<any>((resolve) => {
      resolveFirst = resolve;
    });

    let resolveSecond: (value: any) => void = () => {};
    const secondPromise = new Promise<any>((resolve) => {
      resolveSecond = resolve;
    });

    const searchMock = vi.spyOn(fsApi, "searchInWorkspace");
    searchMock.mockImplementation((_root: string, query: string) => {
      if (query === "first") return firstPromise;
      if (query === "second") return secondPromise;
      return Promise.resolve({ hits: [], truncated: false });
    });

    const onClose = vi.fn();
    const getEditor = vi.fn().mockReturnValue(null);

    render(<GlobalSearchPanel getEditor={getEditor} onClose={onClose} />);

    const input = screen.getByPlaceholderText("在工作区搜索…");

    // 1. Type "first"
    fireEvent.change(input, { target: { value: "first" } });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // 第 5 个参数是搜索代次，用于后端取消旧搜索（#163）
    expect(searchMock).toHaveBeenCalledWith(
      "/test/workspace",
      "first",
      false,
      false,
      expect.any(Number),
    );

    // 2. Type "second" quickly
    fireEvent.change(input, { target: { value: "second" } });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(searchMock).toHaveBeenCalledWith(
      "/test/workspace",
      "second",
      false,
      false,
      expect.any(Number),
    );

    // 两次搜索的代次必须严格递增，后端才能识别并取消旧任务
    const generations = searchMock.mock.calls.map((call) => call[4] as number);
    expect(generations[generations.length - 1]).toBeGreaterThan(
      generations[generations.length - 2],
    );

    // 3. Second promise resolves first with 1 hit
    await act(async () => {
      resolveSecond({
        hits: [
          {
            path: "/test/workspace/b.md",
            line: 1,
            column: 1,
            preview: "second match",
          },
        ],
        truncated: false,
      });
    });

    expect(screen.getByText("b.md")).toBeTruthy();
    expect(screen.getByText("second")).toBeTruthy();

    // 4. First promise resolves later with old hit
    await act(async () => {
      resolveFirst({
        hits: [
          {
            path: "/test/workspace/a.md",
            line: 1,
            column: 1,
            preview: "old stale match",
          },
        ],
        truncated: false,
      });
    });

    // Stale match must not overwrite the latest hits
    expect(screen.queryByText("a.md")).toBeNull();
    expect(screen.getByText("b.md")).toBeTruthy();
  });
});
