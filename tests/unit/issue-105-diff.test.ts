import { describe, it, expect } from "vitest";
import { diffLines } from "../../src/lib/diff";

describe("Issue #105: Optimized diff algorithm", () => {
  it("should compute line differences accurately", () => {
    const oldText = "line 1\nline 2\nline 3";
    const newText = "line 1\nline 2 modified\nline 3";
    const diff = diffLines(oldText, newText);

    expect(diff.length).toBeGreaterThan(0);
    expect(diff.some((d) => d.op === "remove")).toBe(true);
    expect(diff.some((d) => d.op === "add")).toBe(true);
  });
});
