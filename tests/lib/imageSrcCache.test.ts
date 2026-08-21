import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveImageSrc } from "../../src/lib/fs";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
  invoke: vi.fn().mockResolvedValue(undefined),
}));

describe("resolveImageSrc 缓存与解析性能", () => {
  it("非本地协议直接跳过并原样返回", async () => {
    expect(await resolveImageSrc("https://example.com/img.png", "/docs/test.md")).toBe(
      "https://example.com/img.png",
    );
    expect(await resolveImageSrc("data:image/png;base64,123", "/docs/test.md")).toBe(
      "data:image/png;base64,123",
    );
  });

  it("相同文档和路径命中内存缓存", async () => {
    const res1 = await resolveImageSrc("assets/demo.png", "/home/user/doc.md");
    const res2 = await resolveImageSrc("assets/demo.png", "/home/user/doc.md");
    expect(res1).toBe(res2);
    expect(res1).toBe("assets/demo.png");
  });
});
