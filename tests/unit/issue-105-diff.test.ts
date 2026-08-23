import { describe, it, expect } from "vitest";
import { diffLines, nextBackupPath } from "../../src/lib/diff";

describe("Issue #105: Optimized diff algorithm and LCS tests", () => {
  it("should compute exact line differences for modification, addition, and deletion", () => {
    const oldText = "line 1\nline 2\nline 3\nline 4";
    const newText = "line 1\nline 2 modified\nline 4\nline 5";
    const diff = diffLines(oldText, newText);

    // line 1 is common prefix
    expect(diff[0]).toEqual({ op: "equal", local: "line 1", disk: "line 1" });

    // modification: line 2 removed, line 2 modified added
    expect(diff.some((d) => d.op === "remove" && d.local === "line 2")).toBe(true);
    expect(diff.some((d) => d.op === "add" && d.disk === "line 2 modified")).toBe(true);

    // deletion: line 3 removed
    expect(diff.some((d) => d.op === "remove" && d.local === "line 3")).toBe(true);

    // line 4 is matched
    expect(diff.some((d) => d.op === "equal" && d.local === "line 4" && d.disk === "line 4")).toBe(true);

    // addition: line 5 added
    expect(diff.some((d) => d.op === "add" && d.disk === "line 5")).toBe(true);
  });

  it("should handle identical text correctly", () => {
    const text = "aaa\nbbb\nccc";
    const diff = diffLines(text, text);
    expect(diff.length).toBe(3);
    expect(diff.every((d) => d.op === "equal")).toBe(true);
  });

  it("should handle completely disjoint text", () => {
    const textA = "a\nb";
    const textB = "c\nd";
    const diff = diffLines(textA, textB);
    const removes = diff.filter((d) => d.op === "remove");
    const adds = diff.filter((d) => d.op === "add");
    expect(removes.map((d) => d.local)).toEqual(["a", "b"]);
    expect(adds.map((d) => d.disk)).toEqual(["c", "d"]);
  });

  it("should handle empty strings on one or both sides", () => {
    expect(diffLines("", "")).toEqual([]);
    const added = diffLines("", "hello\nworld");
    expect(added.every((d) => d.op === "add")).toBe(true);
    expect(added.length).toBe(2);

    const removed = diffLines("foo\nbar", "");
    expect(removed.every((d) => d.op === "remove")).toBe(true);
    expect(removed.length).toBe(2);
  });

  it("should generate next backup path avoiding collisions with case-insensitivity", () => {
    const existing = new Set([
      "/path/to/note.backup.md",
      "/path/to/note.backup.2.md",
    ]);
    const next = nextBackupPath("/path/to/note.md", existing);
    expect(next).toBe("/path/to/note.backup.3.md");

    // Case insensitivity test
    const existingUpper = new Set(["/PATH/TO/NOTE.BACKUP.MD"]);
    const next2 = nextBackupPath("/path/to/note.md", existingUpper);
    expect(next2).toBe("/path/to/note.backup.2.md");
  });
});
