import { describe, it, expect } from "vitest";
import { isIgnoredSearchDir } from "../../src/lib/searchIgnore";

describe("Issue #90: Search directory ignore checks", () => {
  it("should correctly identify ignored dependency directories", () => {
    expect(isIgnoredSearchDir("node_modules")).toBe(true);
    expect(isIgnoredSearchDir(".git")).toBe(true);
    expect(isIgnoredSearchDir("target")).toBe(true);
    expect(isIgnoredSearchDir(".obsidian")).toBe(true);
    expect(isIgnoredSearchDir("dist")).toBe(true);
    expect(isIgnoredSearchDir("src")).toBe(false);
    expect(isIgnoredSearchDir("docs")).toBe(false);
  });
});
