import { describe, expect, it } from "vitest";
import { base64ToUint8Array, uint8ArrayToBase64 } from "../../src/lib/fs";

function roundTrip(input: Uint8Array): Uint8Array {
  return base64ToUint8Array(uint8ArrayToBase64(input));
}

describe("uint8ArrayToBase64", () => {
  it("round-trips every byte value including 0x80-0xff", () => {
    const input = Uint8Array.from({ length: 256 }, (_, index) => index);
    expect(roundTrip(input)).toEqual(input);
  });

  it.each([0x7fff, 0x8000, 0x8001])(
    "round-trips the 0x8000 chunk boundary (%i bytes)",
    (length) => {
      const input = Uint8Array.from({ length }, (_, index) => (index * 31) & 0xff);
      expect(roundTrip(input)).toEqual(input);
    },
  );

  it("handles an empty array", () => {
    expect(uint8ArrayToBase64(new Uint8Array())).toBe("");
    expect(roundTrip(new Uint8Array())).toEqual(new Uint8Array());
  });

  it("encodes more than 1 MiB without overflowing the call stack", () => {
    const input = Uint8Array.from(
      { length: 1024 * 1024 + 17 },
      (_, index) => (index * 17) & 0xff,
    );
    expect(roundTrip(input)).toEqual(input);
  });
});
