import { describe, it, expect } from "vitest";
import {
  baseName,
  commonParentDir,
  dirNameOf,
  isPathWithin,
  joinPath,
  parentDir,
  relativeToRoot,
} from "../../src/lib/path-utils";

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

  it("commonParentDir 求出一组文件的共同父目录（#228 TomGoh 复审 P2）", () => {
    // 跨顶层目录 → 共同父目录是根，两个同名文件因此可以区分
    expect(commonParentDir(["/a/report.md", "/b/report.md"])).toBe("/");
    // 嵌套：取最深的共同祖先，而不是退到根
    expect(commonParentDir(["/p/q/x.md", "/p/q/r/y.md", "/p/q/z.md"])).toBe("/p/q");
    // 只作目录比较，不受文件名影响
    expect(commonParentDir(["/p/one.md", "/p/two.md"])).toBe("/p");
    // 单个文件：其父目录即可（调用方拿它做展示基准）
    expect(commonParentDir(["/p/q/x.md"])).toBe("/p/q");
  });

  it("commonParentDir 无可用共同父目录时返回 null（调用方应退回完整路径）", () => {
    expect(commonParentDir([])).toBeNull();
    // 分属不同盘符：不能退化成 basename，必须让调用方知道「求不出来」
    expect(commonParentDir(["C:/a/x.md", "D:/b/y.md"])).toBeNull();
    // 同盘不同根：共同父目录退到 C:/ 之前就无路可退
    expect(commonParentDir(["C:/a/x.md", "\\\\server\\share\\y.md"])).toBeNull();
  });

  it("commonParentDir 与 Windows 分隔符 / 盘符大小写兼容", () => {
    expect(commonParentDir(["C:\\proj\\a\\x.md", "c:/proj/b/y.md"])).toBe("C:/proj");
  });

  it("relativeToRoot 会退化为 basename —— 这正是单文件模式不能直接用它作基准的原因", () => {
    // rootPath 只是其中一个文件的父目录时，root 外的路径会丢掉目录信息
    expect(relativeToRoot("/b/report.md", "/a")).toBe("report.md");
    // 换成共同父目录作基准，目录信息就保住了
    expect(relativeToRoot("/b/report.md", commonParentDir(["/a/report.md", "/b/report.md"]))).toBe(
      "b/report.md",
    );
  });
});
