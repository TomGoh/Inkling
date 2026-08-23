// 大纲解析单元测试
// 覆盖 parseOutline（Markdown 标题解析 + 围栏代码块跳过）
// 和 findActiveHeadingIndex（二分查找定位当前激活标题）

import { describe, it, expect } from "vitest";
import {
  parseOutline,
  extractMarkdownOutline,
  findActiveHeadingIndex,
  type EditorOutlineHeading,
} from "../../src/lib/outline";

describe("parseOutline", () => {
  it("解析 ATX 风格标题 # ~ ######", () => {
    const md = "# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6";
    const hs = parseOutline(md);
    expect(hs).toHaveLength(6);
    expect(hs.map((h) => h.level)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("提取标题文本（去除 # 前缀）", () => {
    const hs = parseOutline("# 标题一\n## 标题二");
    expect(hs[0].text).toBe("标题一");
    expect(hs[1].text).toBe("标题二");
  });

  it("去除尾部 # 标记", () => {
    const hs = parseOutline("# 标题 ##\n## 副标题 ###");
    expect(hs[0].text).toBe("标题");
    expect(hs[1].text).toBe("副标题");
  });

  it("跳过围栏代码块内的 # 行（``` 围栏）", () => {
    const md = "# 真标题\n```\n# 这是代码注释\n## 也是代码\n```\n## 真副标题";
    const hs = parseOutline(md);
    expect(hs).toHaveLength(2);
    expect(hs[0].text).toBe("真标题");
    expect(hs[1].text).toBe("真副标题");
  });

  it("跳过波浪线围栏代码块内的 # 行（~~~ 围栏）", () => {
    const md = "# 真标题\n~~~\n# 代码内标题\n~~~\n## 真副标题";
    const hs = parseOutline(md);
    expect(hs).toHaveLength(2);
  });

  it("不同围栏标记互不干扰（``` 不闭合 ~~~）", () => {
    const md = "```\n~~~\n# 仍在代码块内\n```\n# 真标题";
    const hs = parseOutline(md);
    expect(hs).toHaveLength(1);
    expect(hs[0].text).toBe("真标题");
  });

  it("跳过空标题（# 后无内容）", () => {
    const md = "# \n## 真标题\n###   ";
    const hs = parseOutline(md);
    expect(hs).toHaveLength(1);
    expect(hs[0].text).toBe("真标题");
  });

  it("level 超过 6 的不匹配（# 7 个不算是标题）", () => {
    const md = "####### 七个井号不是标题\n# 真标题";
    const hs = parseOutline(md);
    expect(hs).toHaveLength(1);
    expect(hs[0].text).toBe("真标题");
  });

  it("要求 # 后有空格", () => {
    const md = "#无空格不是标题\n# 有空格是标题";
    const hs = parseOutline(md);
    expect(hs).toHaveLength(1);
    expect(hs[0].text).toBe("有空格是标题");
  });

  it("计算标题在原文中的字符偏移", () => {
    const md = "前言\n\n# 标题";
    const hs = parseOutline(md);
    expect(hs[0].offset).toBe(4); // "前言\n\n" = 4 字符
  });

  it("为每个标题生成 id（含序号和 slug）", () => {
    const hs = parseOutline("# Hello World\n## Foo Bar");
    expect(hs[0].id).toBe("h-0-hello-world");
    expect(hs[1].id).toBe("h-1-foo-bar");
  });

  it("空文本返回空数组", () => {
    expect(parseOutline("")).toEqual([]);
  });

  it("无标题的纯文本返回空数组", () => {
    expect(parseOutline("这是一段普通文本\n没有标题")).toEqual([]);
  });

  it("支持中文标题", () => {
    const hs = parseOutline("# 第一章 引言\n## 1.1 背景");
    expect(hs[0].text).toBe("第一章 引言");
    expect(hs[1].text).toBe("1.1 背景");
  });

  it("缩进的 # 不算标题", () => {
    const md = "  # 缩进标题\n# 真标题";
    const hs = parseOutline(md);
    // 缩进 2 空格或制表符的不算 ATX 标题（CommonMark 规范允许最多 3 空格，但 trim() 会匹配）
    expect(hs).toHaveLength(2);
  });

  it("extractMarkdownOutline 返回与 EditorOutlineHeading 一致的结构", () => {
    const md = "# 标题一\n内容\n## 标题二\n更多内容";
    const hs = extractMarkdownOutline(md);
    expect(hs).toHaveLength(2);
    expect(hs[0]).toMatchObject({
      index: 0,
      level: 1,
      text: "标题一",
      pos: 0,
      id: "h-0-标题一",
    });
    expect(hs[1]).toMatchObject({
      index: 1,
      level: 2,
      text: "标题二",
      id: "h-1-标题二",
    });
    expect(hs[1].pos).toBeGreaterThan(0);
  });
});

describe("findActiveHeadingIndex", () => {
  // 构造测试用 headings 数组（pos 按升序，模拟真实文档）
  function makeHeadings(positions: number[]): EditorOutlineHeading[] {
    return positions.map((pos, i) => ({
      index: i,
      level: i + 1,
      text: `标题${i}`,
      pos,
      nodeId: null,
      id: `h-${i}`,
    }));
  }

  it("空数组返回 null", () => {
    expect(findActiveHeadingIndex([], 100)).toBeNull();
  });

  it("选区在第一个标题之前返回 null", () => {
    const hs = makeHeadings([50, 100, 200]);
    expect(findActiveHeadingIndex(hs, 30)).toBeNull();
  });

  it("选区正好在标题位置返回该标题", () => {
    const hs = makeHeadings([50, 100, 200]);
    expect(findActiveHeadingIndex(hs, 100)).toBe(1);
  });

  it("选区在两个标题之间返回前一个", () => {
    const hs = makeHeadings([50, 100, 200]);
    expect(findActiveHeadingIndex(hs, 150)).toBe(1);
  });

  it("选区超过最后一个标题返回最后一个", () => {
    const hs = makeHeadings([50, 100, 200]);
    expect(findActiveHeadingIndex(hs, 500)).toBe(2);
  });

  it("短路：选区等于最后一个标题位置", () => {
    const hs = makeHeadings([50, 100, 200]);
    expect(findActiveHeadingIndex(hs, 200)).toBe(2);
  });

  it("大量标题时二分查找正确", () => {
    const positions = Array.from({ length: 100 }, (_, i) => (i + 1) * 10);
    const hs = makeHeadings(positions);
    // 选区在 pos=550 处，应落在第 55 个标题（index 54，pos=550）
    expect(findActiveHeadingIndex(hs, 555)).toBe(54);
    expect(findActiveHeadingIndex(hs, 555)).toBe(54);
    // 边界
    expect(findActiveHeadingIndex(hs, 10)).toBe(0);
    expect(findActiveHeadingIndex(hs, 1000)).toBe(99);
  });

  it("单个标题", () => {
    const hs = makeHeadings([100]);
    expect(findActiveHeadingIndex(hs, 50)).toBeNull();
    expect(findActiveHeadingIndex(hs, 100)).toBe(0);
    expect(findActiveHeadingIndex(hs, 200)).toBe(0);
  });
});
