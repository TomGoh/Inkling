// 多窗口工具函数测试
// 覆盖 getNewWindowFilePath 的 URL 查询参数解析

import { describe, it, expect, beforeEach, vi } from "vitest";
const { isTauriMock, windowCreateMock } = vi.hoisted(() => ({
  isTauriMock: vi.fn(() => true),
  windowCreateMock: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: isTauriMock }));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: class {
    constructor(label: string, options: unknown) {
      windowCreateMock(label, options);
    }
  },
}));

import {
  getNewWindowFilePath,
  NEW_WINDOW_FILE_KEY,
  openInNewWindow,
} from "../../src/lib/newWindow";

beforeEach(() => {
  // 每个用例重置 URL
  window.history.replaceState({}, "", "/");
  isTauriMock.mockReturnValue(true);
  windowCreateMock.mockReset();
});

describe("openInNewWindow", () => {
  it("encodes the file path and creates a uniquely labelled desktop window", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    vi.spyOn(Math, "random").mockReturnValue(0.123456789);
    const path = "C:\\用户\\notes & drafts\\read me.md";

    await expect(openInNewWindow(path)).resolves.toBe(true);
    expect(windowCreateMock).toHaveBeenCalledTimes(1);
    const [label, options] = windowCreateMock.mock.calls[0];
    expect(label).toMatch(/^inkling-1700000000000-[a-z0-9]{6}$/);
    expect(options).toMatchObject({
      url: `${window.location.origin}/?${NEW_WINDOW_FILE_KEY}=${encodeURIComponent(path)}`,
      title: "read me.md",
      width: 1200,
      height: 800,
    });
  });

  it("uses a different label for successive windows", async () => {
    vi.spyOn(Date, "now").mockReturnValue(42);
    vi.spyOn(Math, "random").mockReturnValueOnce(0.1).mockReturnValueOnce(0.2);
    await openInNewWindow("/docs/a.md");
    await openInNewWindow("/docs/b.md");
    expect(windowCreateMock.mock.calls[0][0]).not.toBe(windowCreateMock.mock.calls[1][0]);
  });

  it("returns false when desktop window construction fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    windowCreateMock.mockImplementationOnce(() => { throw new Error("duplicate label"); });
    await expect(openInNewWindow("/docs/a.md")).resolves.toBe(false);
  });

  it("does not load desktop window APIs in browser mode", async () => {
    isTauriMock.mockReturnValue(false);
    await expect(openInNewWindow("/docs/a.md")).resolves.toBe(false);
    expect(windowCreateMock).not.toHaveBeenCalled();
  });
});

describe("getNewWindowFilePath", () => {
  it("无查询参数返回 null", () => {
    window.history.replaceState({}, "", "/");
    expect(getNewWindowFilePath()).toBeNull();
  });

  it("有 inklingFile 参数返回解码后的路径", () => {
    const path = "/home/user/docs/readme.md";
    window.history.replaceState({}, "", `/?${NEW_WINDOW_FILE_KEY}=${encodeURIComponent(path)}`);
    expect(getNewWindowFilePath()).toBe(path);
  });

  it("Windows 路径正确解码", () => {
    const path = "C:\\Users\\test\\doc.md";
    window.history.replaceState({}, "", `/?${NEW_WINDOW_FILE_KEY}=${encodeURIComponent(path)}`);
    expect(getNewWindowFilePath()).toBe(path);
  });

  it("含中文的路径正确解码", () => {
    const path = "/用户/文档/笔记.md";
    window.history.replaceState({}, "", `/?${NEW_WINDOW_FILE_KEY}=${encodeURIComponent(path)}`);
    expect(getNewWindowFilePath()).toBe(path);
  });

  it("空值参数返回 null", () => {
    window.history.replaceState({}, "", `/?${NEW_WINDOW_FILE_KEY}=`);
    expect(getNewWindowFilePath()).toBeNull();
  });

  it("其他参数存在时不干扰", () => {
    const path = "/docs/test.md";
    window.history.replaceState(
      {},
      "",
      `/?foo=bar&${NEW_WINDOW_FILE_KEY}=${encodeURIComponent(path)}&baz=1`,
    );
    expect(getNewWindowFilePath()).toBe(path);
  });

  it("URL 异常时返回 null", () => {
    // mock URLSearchParams 抛错
    const original = window.URLSearchParams;
    vi.stubGlobal("URLSearchParams", class {
      constructor() {
        throw new Error("mock error");
      }
    });
    expect(getNewWindowFilePath()).toBeNull();
    vi.stubGlobal("URLSearchParams", original);
  });
});
