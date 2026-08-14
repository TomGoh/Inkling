import { describe, expect, it } from "vitest";
import {
  computeLineWeights,
  lineColumnToOffset,
  mapScrollTop,
  markdownOffsetToProsePos,
  offsetToLineColumn,
  prosePosToMarkdownOffset,
} from "../../src/lib/source-mode-cursor";

describe("source-mode-cursor", () => {
  it("offsetToLineColumn 解析换行", () => {
    expect(offsetToLineColumn("a\nbc", 3)).toEqual({ line: 1, column: 1 });
    expect(offsetToLineColumn("hello", 0)).toEqual({ line: 0, column: 0 });
    expect(offsetToLineColumn("hello", 5)).toEqual({ line: 0, column: 5 });
  });

  it("lineColumnToOffset 与 offsetToLineColumn 互逆", () => {
    const text = "# Hi\n\npara\nline2";
    for (const offset of [0, 1, 4, 5, 6, 10, text.length]) {
      const lc = offsetToLineColumn(text, offset);
      expect(lineColumnToOffset(text, lc.line, lc.column)).toBe(offset);
    }
  });

  it("prosePosToMarkdownOffset 简单文档", () => {
    const md = "# Hi\n\npara";
    expect(prosePosToMarkdownOffset(md, "# Hi")).toBe(4);
    expect(prosePosToMarkdownOffset(md, "")).toBe(0);
  });

  it("prosePosToMarkdownOffset 多块文档：全量 textBefore 分隔符不一致时按当前行片段定位", () => {
    // PM textBetween 用单个 \n 连接块，markdown 块间是空行，全量 indexOf 会失败。
    // 应回退到光标所在行片段（标题行）从后往前匹配。
    const md = "# 一级\n\n正文段落 A\n\n## 二级标题\n\n正文段落 B";
    const textBefore = "一级\n正文段落 A\n二级标题"; // 光标位于「## 二级标题」末尾
    const result = prosePosToMarkdownOffset(md, textBefore);
    // 定位到 md 中最后出现的「二级标题」末尾（index 16 + 4 = 20）
    expect(md.slice(result - "二级标题".length, result)).toBe("二级标题");
    expect(result).toBe(md.lastIndexOf("二级标题") + "二级标题".length);
  });

  it("prosePosToMarkdownOffset 代码块内：用代码内容行定位", () => {
    const md = "# T\n\n```js\nconst a = 1;\n```\n\ntail";
    const textBefore = "T\nconst a = 1;"; // 光标在代码块第一行末尾
    const result = prosePosToMarkdownOffset(md, textBefore);
    expect(md.slice(result - "const a = 1;".length, result)).toBe("const a = 1;");
  });

  it("mapScrollTop 按比例映射", () => {
    expect(mapScrollTop(50, 100, 200)).toBe(100);
    expect(mapScrollTop(0, 100, 200)).toBe(0);
    expect(mapScrollTop(100, 0, 200)).toBe(0); // 源高度非法回退 0
  });

  it("computeLineWeights 围栏代码块内部行权重极小、空行 0", () => {
    const md = "# T\n\n```js\ncode1\ncode2\n```\n\ntail";
    const weights = computeLineWeights(md);
    expect(weights[0]).toBe(1); // 标题
    expect(weights[1]).toBe(0); // 空行
    expect(weights[2]).toBe(1); // 开启围栏
    expect(weights[3]).toBeLessThan(1); // 代码行
    expect(weights[4]).toBeLessThan(1); // 代码行
    expect(weights[5]).toBe(1); // 闭合围栏
    expect(weights[6]).toBe(0); // 空行
    expect(weights[7]).toBe(1); // tail
  });

  it("markdownOffsetToProsePos 空文档回退到 1", () => {
    expect(markdownOffsetToProsePos(0, "", 0)).toBe(1);
  });

  it("markdownOffsetToProsePos 起点/终点/越界有确定性兜底", () => {
    const md = "# T\n\npara";
    expect(markdownOffsetToProsePos(100, md, 0)).toBe(1);
    expect(markdownOffsetToProsePos(100, md, md.length)).toBe(99); // docSize-1
    expect(markdownOffsetToProsePos(100, md, -5)).toBe(1);
    expect(markdownOffsetToProsePos(100, md, 9999)).toBe(99);
  });

  it("markdownOffsetToProsePos 代码块不拉偏比例", () => {
    // 大段代码块内部行权重极小：光标在代码块「后」的正文，不应被 30 行代码
    // 行数稀释到接近文末（旧线性比例会误判）。
    const md =
      "# T\n\n```\n" +
      Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n") +
      "\n```\n\ntail text";
    const tailIdx = md.lastIndexOf("tail text");
    const pos = markdownOffsetToProsePos(1000, md, tailIdx);
    // 代码块仅算约 3 个权重（开/闭围栏+内容 30*0.02=0.6），total≈4.6，
    // 光标在最后一行前已完成 3.6 → 比例应显著小于 1，而不是接近 1
    expect(pos).toBeLessThan(850);
    expect(pos).toBeGreaterThan(1);
  });

  it("markdownOffsetToProsePos 常规段落按块级权重映射且在 [1, docSize-1]", () => {
    const md = "# 标题\n\n第一段\n第二段\n\n第三段";
    // 光标在第三段开头
    const thirdIdx = md.lastIndexOf("第三段");
    const pos = markdownOffsetToProsePos(100, md, thirdIdx);
    expect(pos).toBeGreaterThanOrEqual(1);
    expect(pos).toBeLessThanOrEqual(99);
  });
});
