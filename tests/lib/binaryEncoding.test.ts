import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { uint8ArrayToBase64 } from "../../src/lib/fs";

function expectStandardBase64(input: Uint8Array): void {
  expect(uint8ArrayToBase64(input)).toBe(Buffer.from(input).toString("base64"));
}

describe("uint8ArrayToBase64", () => {
  it("round-trips every byte value including 0x80-0xff", () => {
    const input = Uint8Array.from({ length: 256 }, (_, index) => index);
    expectStandardBase64(input);
  });

  it.each([0x7fff, 0x8000, 0x8001])(
    "round-trips the 0x8000 chunk boundary (%i bytes)",
    (length) => {
      const input = Uint8Array.from({ length }, (_, index) => (index * 31) & 0xff);
      expectStandardBase64(input);
    },
  );

  it("handles an empty array", () => {
    expect(uint8ArrayToBase64(new Uint8Array())).toBe("");
  });

  it("encodes more than 1 MiB without overflowing the call stack", () => {
    const input = Uint8Array.from(
      { length: 1024 * 1024 + 17 },
      (_, index) => (index * 17) & 0xff,
    );
    expectStandardBase64(input);
  });
});
