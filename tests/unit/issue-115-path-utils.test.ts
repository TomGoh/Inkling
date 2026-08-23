import { describe, it, expect } from "vitest";
import { parentDir, dirNameOf, joinPath, isPathWithin, baseName } from "../../src/lib/path-utils";

describe("Issue #115: Unified Path Utilities", () => {
  it("baseName handles POSIX, Windows, and Windows UNC paths correctly", () => {
    expect(baseName("/foo/bar/baz.md")).toBe("baz.md");
    expect(baseName("C:\\foo\\bar\\baz.md")).toBe("baz.md");
    expect(baseName("\\\\server\\share\\folder\\file.md")).toBe("file.md");
    expect(baseName("\\\\server\\share\\file.md")).toBe("file.md");
    expect(baseName("singlefile.md")).toBe("singlefile.md");
    expect(baseName("")).toBe("");
  });

  it("parentDir and dirNameOf handle POSIX and Windows root correctly", () => {
    expect(parentDir("/a/b/c.md")).toBe("/a/b");
    expect(parentDir("/file.md")).toBe("/");
    expect(parentDir("C:\\test\\file.md")).toBe("C:\\test");
    expect(parentDir("C:\\file.md")).toBe("C:\\");
    expect(dirNameOf("/a/b")).toBe("/a");
  });

  it("joinPath joins segments correctly", () => {
    expect(joinPath("/foo", "bar", "baz.md")).toBe("/foo/bar/baz.md");
    expect(joinPath("C:\\foo", "bar")).toBe("C:\\foo\\bar");
  });

  it("isPathWithin checks containment accurately", () => {
    expect(isPathWithin("/foo/bar/baz.md", "/foo")).toBe(true);
    expect(isPathWithin("/foo/bar/baz.md", "/foo/bar")).toBe(true);
    expect(isPathWithin("/other/file.md", "/foo")).toBe(false);
  });
});
