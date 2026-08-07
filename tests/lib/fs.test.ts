// 文件系统工具函数测试
// 覆盖 joinPath（路径拼接，兼容 Win/Unix）和 resolvePathFromDocument（浏览器分支）

import { describe, it, expect, vi } from "vitest";
import { joinPath, listDir, resolvePathFromDocument } from "../../src/lib/fs";

describe("listDir", () => {
  it("浏览器 mock 只返回根目录的直接子项", async () => {
    const root = await listDir("/mock-workspace");

    expect(root.path).toBe("/mock-workspace");
    expect(root.children.map((node) => node.name)).toEqual(["notes", "intro.md"]);
    expect(root.children.find((node) => node.name === "notes")?.children).toEqual([]);
  });

  it("展开目录时才返回该目录的直接子项", async () => {
    const notes = await listDir("/mock-workspace/notes");

    expect(notes.path).toBe("/mock-workspace/notes");
    expect(notes.children).toContainEqual(
      expect.objectContaining({ name: "readme.md", is_dir: false }),
    );
  });

  it("每次返回独立副本", async () => {
    const first = await listDir("/mock-workspace");
    first.children.length = 0;

    const second = await listDir("/mock-workspace");
    expect(second.children.length).toBeGreaterThan(0);
  });

  it("不存在的目录返回明确错误", async () => {
    await expect(listDir("/mock-workspace/missing")).rejects.toThrow("路径不存在");
  });
});

describe("joinPath", () => {
  it("Unix 路径用 / 拼接", () => {
    expect(joinPath("/home/user", "docs")).toBe("/home/user/docs");
  });

  it("Windows 路径用 \\ 拼接", () => {
    expect(joinPath("C:\\Users\\test", "docs")).toBe("C:\\Users\\test\\docs");
  });

  it("去除 base 末尾的分隔符", () => {
    expect(joinPath("/home/user/", "docs")).toBe("/home/user/docs");
    expect(joinPath("/home/user//", "docs")).toBe("/home/user/docs");
    expect(joinPath("C:\\Users\\test\\", "docs")).toBe("C:\\Users\\test\\docs");
  });

  it("去除 rel 开头的分隔符", () => {
    expect(joinPath("/home/user", "/docs")).toBe("/home/user/docs");
    expect(joinPath("/home/user", "//docs")).toBe("/home/user/docs");
  });

  it("同时存在首尾分隔符", () => {
    expect(joinPath("/home/user/", "/docs")).toBe("/home/user/docs");
  });

  it("混合分隔符时优先用 /", () => {
    // base 同时含 \ 和 / 时，sep 为 /
    expect(joinPath("C:\\Users/test", "docs")).toBe("C:\\Users/test/docs");
  });

  it("空 rel 返回 base 加尾部分隔符（left+sep+空）", () => {
    // 实际行为：left 去尾分隔符后 + sep + ""，结果带尾部 sep
    expect(joinPath("/home/user/", "")).toBe("/home/user/");
    expect(joinPath("/home/user", "")).toBe("/home/user/");
  });

  it("多级 rel", () => {
    expect(joinPath("/home/user", "docs/readme.md")).toBe("/home/user/docs/readme.md");
  });
});

describe("resolvePathFromDocument", () => {
  it("浏览器环境（非 Tauri）用 / 拼接 paths", async () => {
    // happy-dom 下 isTauri() 返回 false
    const result = await resolvePathFromDocument("/doc.md", "images", "pic.png");
    expect(result).toBe("images/pic.png");
  });

  it("浏览器环境 documentPath 为空时仍拼接 paths", async () => {
    const result = await resolvePathFromDocument("", "a", "b");
    expect(result).toBe("a/b");
  });

  it("浏览器环境无 paths 返回空字符串", async () => {
    const result = await resolvePathFromDocument("/doc.md");
    expect(result).toBe("");
  });
});
