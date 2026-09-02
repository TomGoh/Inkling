import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  invoke: invokeMock,
  convertFileSrc: vi.fn(),
}));

import { writeBinaryFile } from "../../src/lib/fs";

describe("writeBinaryFile desktop IPC", () => {
  beforeEach(() => invokeMock.mockReset().mockResolvedValue(undefined));

  it("sends exact high bytes as base64 instead of a JSON number array", async () => {
    const bytes = Uint8Array.from([0x00, 0x7f, 0x80, 0xff]);
    await writeBinaryFile("/tmp/image.bin", bytes);
    expect(invokeMock).toHaveBeenCalledWith("write_binary_file", {
      filePath: "/tmp/image.bin",
      data: "AH+A/w==",
    });
  });

  it("propagates Rust-side write failures", async () => {
    invokeMock.mockRejectedValueOnce(new Error("disk full"));
    await expect(writeBinaryFile("/tmp/image.bin", new Uint8Array([1])))
      .rejects.toThrow("disk full");
  });
});
