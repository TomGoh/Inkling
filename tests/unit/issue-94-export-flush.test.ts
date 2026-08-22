import { describe, it, expect, vi } from "vitest";
import { copyMarkdown } from "../../src/lib/exporter";
import { useWorkspace } from "../../src/store/workspace";

describe("Issue #94: Exporter flush publisher", () => {
  it("should copy latest markdown content", async () => {
    useWorkspace.setState({ currentContent: "# Latest Content" });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    const ok = await copyMarkdown();
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith("# Latest Content");
  });
});
