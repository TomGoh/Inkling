// slugify 单元测试
// GitHub 风格 slug：转小写、去标点、空格/下划线转连字符、Unicode 感知

import { describe, it, expect } from "vitest";
import { slugify } from "../../src/lib/outline";

describe("slugify", () => {
  it("转小写", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("空格转连字符", () => {
    expect(slugify("foo bar baz")).toBe("foo-bar-baz");
  });

  it("下划线被移除（非替换为连字符）", () => {
    // 下划线不属于 \p{L}\p{N}，被 [^\p{L}\p{N}\s-] 移除，前后无空格故直接拼接
    expect(slugify("foo_bar_baz")).toBe("foobarbaz");
  });

  it("多个连字符合并为一个", () => {
    expect(slugify("foo   bar")).toBe("foo-bar");
    expect(slugify("foo--bar")).toBe("foo-bar");
  });

  it("去除首尾连字符", () => {
    expect(slugify("--foo--")).toBe("foo");
    expect(slugify("  foo  ")).toBe("foo");
  });

  it("去除标点符号", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
    expect(slugify("foo (bar) [baz]")).toBe("foo-bar-baz");
    expect(slugify("foo: bar; baz.")).toBe("foo-bar-baz");
  });

  it("保留中文字符", () => {
    expect(slugify("你好 世界")).toBe("你好-世界");
    expect(slugify("标题一")).toBe("标题一");
  });

  it("保留日文/韩文等 Unicode 字母", () => {
    expect(slugify("こんにちは")).toBe("こんにちは");
    expect(slugify("안녕하세요")).toBe("안녕하세요");
  });

  it("保留数字", () => {
    expect(slugify("Chapter 1")).toBe("chapter-1");
    expect(slugify("v2.0 release")).toBe("v20-release");
  });

  it("空字符串返回空", () => {
    expect(slugify("")).toBe("");
    expect(slugify("   ")).toBe("");
    expect(slugify("---")).toBe("");
  });

  it("混合中英文标点：中文标点被去除后直接拼接", () => {
    // 中文逗号/叹号是 Unicode 标点，被 [^\p{L}\p{N}\s-] 移除，前后无空格故直接拼接
    expect(slugify("Hello，World！你好")).toBe("helloworld你好");
  });
});
