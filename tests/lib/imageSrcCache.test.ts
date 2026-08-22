import { describe, it, expect, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/path", () => ({
  resolve: (...args: string[]) => Promise.resolve(args.join("/")),
}));

import { resolveImageSrc } from "../../src/lib/fs";

describe("resolveImageSrc 缓存与 LRU 解析性能", () => {
  it("非本地协议直接跳过并原样返回", async () => {
    expect(await resolveImageSrc("https://example.com/img.png", "/docs/test.md")).toBe(
      "https://example.com/img.png",
    );
    expect(await resolveImageSrc("data:image/png;base64,123", "/docs/test.md")).toBe(
      "data:image/png;base64,123",
    );
  });

  it("相同文档和路径在 Tauri 环境命中内存缓存并更新 LRU", async () => {
    const res1 = await resolveImageSrc("assets/demo.png", "/home/user/doc.md");
    expect(res1).toBe("asset://localhost//home/user/doc.md/../assets/demo.png");

    const res2 = await resolveImageSrc("assets/demo.png", "/home/user/doc.md");
    expect(res2).toBe(res1);
  });
});
