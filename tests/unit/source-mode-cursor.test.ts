import { describe, expect, it } from "vitest";
import {
  computeLineWeights,
  lineColumnToOffset,
  mapScrollTop,
  markdownNormLines,
  markdownOffsetToProsePos,
  offsetToLineColumn,
  prosePosToMarkdownOffset,
  stripInlineMarkup,
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

  it("prosePosToMarkdownOffset 多块文档：锚定到末行所在行的行首", () => {
    // PM textBetween 用单个 \n 连接块，markdown 块间是空行，全量 indexOf 会失败。
    // 新版按「末行（视口顶部内容）+ 向前上下文」在归一化 md 行里匹配，
    // 返回末行所在 markdown 行的行首偏移。
    const md = "# 一级\n\n正文段落 A\n\n## 二级标题\n\n正文段落 B";
    const textBefore = "一级\n正文段落 A\n二级标题"; // 光标位于「## 二级标题」末尾
    const result = prosePosToMarkdownOffset(md, textBefore);
    expect(result).toBe(md.indexOf("## 二级标题"));
  });

  it("prosePosToMarkdownOffset 代码块内：锚定到代码行的行首", () => {
    const md = "# T\n\n```js\nconst a = 1;\n```\n\ntail";
    const textBefore = "T\nconst a = 1;"; // 光标在代码块第一行末尾
    const result = prosePosToMarkdownOffset(md, textBefore);
    expect(result).toBe(md.indexOf("const a = 1;"));
  });

  it("prosePosToMarkdownOffset 表格/标记密集文档：锚定到视口顶部标题而非漂到文末（#136）", () => {
    // 复现 UI-UX-REVIEW.md：大量表格 + 重复短单元格（7.0 / P0 / 低）。
    // 旧实现按整段 textBefore 子串匹配 + lastIndexOf，重复短行会命中靠后
    // 出现处，把锚点拽到文档后部甚至文末。新版以「末行=视口顶部内容」为锚，
    // 用向前上下文消歧，必须落在真正的目标标题行首。
    const md = [
      "# 报告",
      "",
      "| 维度 | 分数 |",
      "| --- | --- |",
      "| 布局 | 7.0 |",
      "| 色彩 | 7.0 |",
      "",
      "## 3. 问题",
      "",
      "| # | 问题 | 优先级 |",
      "| --- | --- | --- |",
      "| P0-1 | 工具栏堆积 | P0 |",
      "| P0-2 | 布局崩塌 | P0 |",
      "| P1-1 | 间距 | P1 |",
      "",
      "## 6. 组件建议",
      "",
      "**判定**：当前 Editor 是名副其实的写作环境。",
      "",
      "## 9. 实施计划",
    ].join("\n");
    // PM textBetween 形态：标题去 #，表格每单元格一行，粗体被剥离
    const textBefore = [
      "报告",
      "维度",
      "分数",
      "布局",
      "7.0",
      "色彩",
      "7.0",
      "3. 问题",
      "#",
      "问题",
      "优先级",
      "P0-1",
      "工具栏堆积",
      "P0",
      "P0-2",
      "布局崩塌",
      "P0",
      "P1-1",
      "间距",
      "P1",
      "6. 组件建议",
    ].join("\n");
    const result = prosePosToMarkdownOffset(md, textBefore);
    expect(result).toBe(md.indexOf("## 6. 组件建议"));
  });

  it("prosePosToMarkdownOffset 重复短单元格用向前上下文消歧（#136）", () => {
    // 「低」在两张表格里重复出现；末行单独看有歧义，必须靠向前上下文
    // 选中第二张表「丁」行的那个，而不是第一张表的任意一个。
    const md = [
      "# T",
      "",
      "| 项 | 级别 |",
      "| --- | --- |",
      "| 甲 | 低 |",
      "| 乙 | 低 |",
      "",
      "中间段落",
      "",
      "| 项 | 级别 |",
      "| --- | --- |",
      "| 丙 | 低 |",
      "| 丁 | 低 |",
    ].join("\n");
    const textBefore = [
      "T",
      "项",
      "级别",
      "甲",
      "低",
      "乙",
      "低",
      "中间段落",
      "项",
      "级别",
      "丙",
      "低",
      "丁",
      "低",
    ].join("\n");
    const result = prosePosToMarkdownOffset(md, textBefore);
    expect(result).toBe(md.indexOf("| 丁 | 低 |"));
  });

  it("prosePosToMarkdownOffset 近似重复行：完全相等的末行候选优先于模糊同分候选（#136）", () => {
    // compute(2,N) 与 compute(22,N) 公共前缀占比高会被模糊匹配成同分候选；
    // 末行与 22 节完全相等时，必须锚到 22 节而不是更早的 2 节。
    const code = (i: number, n: number) =>
      `const v${n} = compute(${i}, ${n}); // 填充行 ${n}`;
    const md = [
      "# 混排",
      "## 代码节 2",
      "```js",
      ...Array.from({ length: 60 }, (_, j) => code(2, j)),
      "```",
      "## 代码节 22",
      "```js",
      ...Array.from({ length: 60 }, (_, j) => code(22, j)),
      "```",
    ].join("\n");
    // 视口顶部在 22 节代码块末尾：末行 = v59(22)，向前若干行是同节上下文
    const textBefore = [
      "混排",
      "代码节 2",
      ...Array.from({ length: 60 }, (_, j) => code(2, j)),
      "代码节 22",
      ...Array.from({ length: 60 }, (_, j) => code(22, j)).slice(0, 59),
      code(22, 59),
    ].join("\n");
    const result = prosePosToMarkdownOffset(md, textBefore);
    expect(result).toBe(md.indexOf(code(22, 59)));
  });

  it("stripInlineMarkup 剥离粗体/行内代码/链接保留纯文本", () => {
    expect(
      stripInlineMarkup("**Problem**: 带 `代码` 与 [链接](http://x) 的行"),
    ).toBe("Problem: 带 代码 与 链接 的行");
    expect(stripInlineMarkup("普通文本")).toBe("普通文本");
  });

  it("markdownNormLines 表格按单元格拆行、跳过围栏标记与分割线", () => {
    const md = [
      "| a | **b** |",
      "| --- | --- |",
      "```js",
      "code()",
      "```",
      "***",
      "## 标题",
    ].join("\n");
    const lines = markdownNormLines(md);
    expect(lines.map((l) => l.text)).toEqual(["a", "b", "code()", "标题"]);
    // 同一表格行的单元格共享该行行首偏移；锚点按行粒度消费
    expect(lines[0].offset).toBe(0);
    expect(lines[1].offset).toBe(0);
    expect(lines[2].offset).toBe(md.indexOf("code()"));
    expect(lines[3].offset).toBe(md.indexOf("## 标题"));
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
