import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock, resolveMock, convertFileSrcMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  resolveMock: vi.fn(),
  convertFileSrcMock: vi.fn((path: string) => `asset://${path}`),
}));

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  invoke: invokeMock,
  convertFileSrc: convertFileSrcMock,
}));
vi.mock("@tauri-apps/api/path", () => ({ resolve: resolveMock }));

import { resolveImageSrc } from "../../src/lib/fs";

describe("resolveImageSrc desktop path handling", () => {
  beforeEach(() => {
    invokeMock.mockReset().mockResolvedValue(undefined);
    resolveMock.mockReset().mockImplementation((...parts: string[]) =>
      Promise.resolve(parts.at(-1)),
    );
    convertFileSrcMock.mockClear();
  });

  it("strips the leading slash from a Windows file URL", async () => {
    await resolveImageSrc("file:///C:/Users/Alice/image.png", "C:/docs/note.md");
    expect(resolveMock).toHaveBeenCalledWith(
      "C:/docs/note.md", "..", "C:/Users/Alice/image.png",
    );
  });

  it("decodes spaces and Chinese characters before resolving", async () => {
    await resolveImageSrc(
      "images/%E4%B8%AD%E6%96%87%20cover.png",
      "/docs/encoded.md",
    );
    expect(resolveMock).toHaveBeenCalledWith(
      "/docs/encoded.md", "..", "images/中文 cover.png",
    );
  });

  it("preserves malformed percent escapes instead of throwing", async () => {
    await expect(resolveImageSrc("images/100%cover.png", "/docs/bad.md"))
      .resolves.toBe("asset://images/100%cover.png");
    expect(resolveMock).toHaveBeenCalledWith(
      "/docs/bad.md", "..", "images/100%cover.png",
    );
  });

  it("rolls back a failed directory allowance so the next image retries", async () => {
    invokeMock.mockRejectedValueOnce(new Error("ACL denied")).mockResolvedValue(undefined);
    await resolveImageSrc("retry-dir/first.png", "/docs/retry.md");
    await resolveImageSrc("retry-dir/second.png", "/docs/retry.md");
    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(invokeMock).toHaveBeenNthCalledWith(1, "allow_asset_dir", { path: "retry-dir" });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "allow_asset_dir", { path: "retry-dir" });
  });

  it("allows a directory only once for multiple images", async () => {
    await resolveImageSrc("shared-dir/one.png", "/docs/shared.md");
    await resolveImageSrc("shared-dir/two.png", "/docs/shared.md");
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("allow_asset_dir", { path: "shared-dir" });
  });
});
