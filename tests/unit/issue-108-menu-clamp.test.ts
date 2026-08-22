import { describe, it, expect } from "vitest";
import { clampMenuPosition } from "../../src/hooks/useContextMenuClamping";

describe("Issue #108: Context menu viewport clamping", () => {
  it("should clamp menu position to avoid overflowing viewport", () => {
    const pos = clampMenuPosition(950, 750, 100, 80, 1000, 800);
    expect(pos.x).toBeLessThanOrEqual(900);
    expect(pos.y).toBeLessThanOrEqual(720);
  });

  it("should maintain position when inside bounds", () => {
    const pos = clampMenuPosition(200, 300, 100, 80, 1000, 800);
    expect(pos.x).toBe(200);
    expect(pos.y).toBe(300);
  });
});
