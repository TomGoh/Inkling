// 多窗口工具函数测试
// 覆盖 getNewWindowFilePath 的 URL 查询参数解析

import { describe, it, expect, beforeEach, vi } from "vitest";
import { getNewWindowFilePath, NEW_WINDOW_FILE_KEY } from "../../src/lib/newWindow";

beforeEach(() => {
  // 每个用例重置 URL
  window.history.replaceState({}, "", "/");
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
