// 文件树纯函数测试
// 覆盖单层目录结果合并、已加载子树保留和可见行扁平化

import { describe, expect, it } from "vitest";
import {
  collectDirectoryPaths,
  flattenVisibleTree,
  isPathWithin,
  mergeDirectoryListing,
} from "../../src/lib/fileTree";
import type { FileNode } from "../../src/lib/fs";

function dir(path: string, children: FileNode[] = []): FileNode {
  return {
    name: path.split("/").pop() ?? path,
    path,
    is_dir: true,
    children,
  };
}

function file(path: string): FileNode {
  return {
    name: path.split("/").pop() ?? path,
    path,
    is_dir: false,
    children: [],
  };
}

describe("mergeDirectoryListing", () => {
  it("替换目标目录的直接子项并保留已加载子树", () => {
    const tree = dir("/workspace", [
      dir("/workspace/docs", [dir("/workspace/docs/guide", [file("/workspace/docs/guide/a.md")])]),
    ]);
    const listing = dir("/workspace/docs", [
      dir("/workspace/docs/guide"),
      file("/workspace/docs/readme.md"),
    ]);

    const merged = mergeDirectoryListing(tree, listing);
    const docs = merged.children[0];

    expect(docs.children.map((node) => node.name)).toEqual(["guide", "readme.md"]);
    expect(docs.children[0].children[0].name).toBe("a.md");
  });

  it("目标目录不存在时保持原树引用", () => {
    const tree = dir("/workspace");
    expect(mergeDirectoryListing(tree, dir("/other"))).toBe(tree);
  });
});

describe("flattenVisibleTree", () => {
  it("只遍历显式展开目录的后代", () => {
    const tree = dir("/workspace", [
      dir("/workspace/docs", [file("/workspace/docs/readme.md")]),
      file("/workspace/root.md"),
    ]);

    expect(
      flattenVisibleTree(tree, new Set(["/workspace"])).map(({ node }) => node.name),
    ).toEqual(["workspace", "docs", "root.md"]);
    expect(
      flattenVisibleTree(tree, new Set(["/workspace", "/workspace/docs"])).map(
        ({ node }) => node.name,
      ),
    ).toEqual(["workspace", "docs", "readme.md", "root.md"]);
  });
});

describe("文件树路径辅助", () => {
  it("收集局部树中的目录路径", () => {
    const tree = dir("/workspace", [dir("/workspace/docs"), file("/workspace/a.md")]);
    expect(collectDirectoryPaths(tree)).toEqual(
      new Set(["/workspace", "/workspace/docs"]),
    );
  });

  it("直接子项极多时不会触发函数参数上限", () => {
    const leaf = file("/workspace/note.md");
    const tree = dir("/workspace", Array.from({ length: 150_000 }, () => leaf));

    expect(collectDirectoryPaths(tree)).toEqual(new Set(["/workspace"]));
  });

  it("兼容 Unix 与 Windows 子路径", () => {
    expect(isPathWithin("/workspace/docs", "/workspace")).toBe(true);
    expect(isPathWithin("/workspace/docs", "/workspace/")).toBe(true);
    expect(isPathWithin("C:\\workspace\\docs", "C:\\workspace")).toBe(true);
    expect(isPathWithin("C:\\docs", "C:\\")).toBe(true);
    expect(isPathWithin("/workspace-other", "/workspace")).toBe(false);
  });
});
