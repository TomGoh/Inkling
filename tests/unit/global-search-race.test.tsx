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
      return Promise.resolve([]);
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

    expect(searchMock).toHaveBeenCalledWith("/test/workspace", "first", false, false);

    // 2. Type "second" quickly
    fireEvent.change(input, { target: { value: "second" } });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(searchMock).toHaveBeenCalledWith("/test/workspace", "second", false, false);

    // 3. Second promise resolves first with 1 hit
    await act(async () => {
      resolveSecond([
        {
          path: "/test/workspace/b.md",
          line: 1,
          col: 0,
          preview: "second match",
          matchLen: 6,
        },
      ]);
    });

    expect(screen.getByText("b.md")).toBeTruthy();
    expect(screen.getByText("second")).toBeTruthy();

    // 4. First promise resolves later with old hit
    await act(async () => {
      resolveFirst([
        {
          path: "/test/workspace/a.md",
          line: 1,
          col: 0,
          preview: "old stale match",
          matchLen: 3,
        },
      ]);
    });

    // Stale match must not overwrite the latest hits
    expect(screen.queryByText("a.md")).toBeNull();
    expect(screen.getByText("b.md")).toBeTruthy();
  });
});
