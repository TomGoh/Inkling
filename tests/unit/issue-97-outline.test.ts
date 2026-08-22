import { describe, it, expect } from "vitest";
import { parseOutline } from "../../src/lib/outline";

describe("Issue #97: parseOutline header levels and fences", () => {
  it("should ignore hashes inside fenced code blocks", () => {
    const md = [
      "# Real Heading 1",
      "```typescript",
      "# Fake Heading Inside Fence",
      "## Another Fake",
      "```",
      "## Real Heading 2",
    ].join("\n");

    const outline = parseOutline(md);
    expect(outline).toHaveLength(2);
    expect(outline[0].text).toBe("Real Heading 1");
    expect(outline[0].level).toBe(1);
    expect(outline[1].text).toBe("Real Heading 2");
    expect(outline[1].level).toBe(2);
  });

  it("should handle tildes code fences ~~~", () => {
    const md = [
      "# Real Heading 1",
      "~~~python",
      "# Fake Heading Inside Tildes",
      "~~~",
      "### Real Heading 3",
    ].join("\n");

    const outline = parseOutline(md);
    expect(outline).toHaveLength(2);
    expect(outline[0].text).toBe("Real Heading 1");
    expect(outline[1].text).toBe("Real Heading 3");
    expect(outline[1].level).toBe(3);
  });
});
