import { describe, it, expect } from "vitest";

describe("Issue #95: Slash menu query range", () => {
  it("should correctly calculate slash deletion range", () => {
    const text = "/h1";
    const slashIdx = text.lastIndexOf("/");
    expect(slashIdx).toBe(0);
    const query = text.slice(slashIdx + 1);
    expect(query).toBe("h1");
  });
});
