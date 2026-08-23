import { describe, it, expect, vi } from "vitest";
import { copyMarkdown } from "../../src/lib/exporter";
import { useWorkspace } from "../../src/store/workspace";
import * as publisherModule from "../../src/components/Editor/markdown-publisher";

describe("Issue #94: Exporter flush publisher", () => {
  it("should flush all markdown publishers before copying markdown", async () => {
    const flushSpy = vi.spyOn(publisherModule, "flushAllMarkdownPublishers");
    useWorkspace.setState({ currentContent: "# Latest Content" });

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    const ok = await copyMarkdown();
    expect(ok).toBe(true);
    expect(flushSpy).toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith("# Latest Content");

    flushSpy.mockRestore();
  });
});
