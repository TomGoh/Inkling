// 字数统计单元测试
// 覆盖 countStats 的：空输入、纯中文、纯英文、中英混合、行数/字符数/阅读时长

import { describe, it, expect } from "vitest";
import { countStats } from "../../src/lib/stats";

describe("countStats", () => {
  it("空字符串返回全零", () => {
    expect(countStats("")).toEqual({ words: 0, chars: 0, lines: 0, readingMinutes: 0 });
  });

  it("纯英文按词计数", () => {
    const r = countStats("hello world foo bar");
    expect(r.words).toBe(4);
    expect(r.chars).toBe(19);
    expect(r.lines).toBe(1);
  });

  it("纯中文按字计数", () => {
    const r = countStats("你好世界测试");
    expect(r.words).toBe(6);
    expect(r.chars).toBe(6);
  });

  it("中英混合：中文字数 + 英文词数", () => {
    const r = countStats("你好 world 测试 foo");
    // 中文 4 字 + 英文 2 词
    expect(r.words).toBe(6);
  });

  it("数字串算一个词", () => {
    const r = countStats("版本 12345 发布");
    // 中文按字计："版本"(2) + "发布"(2) = 4 字；数字串 "12345" = 1 词；合计 5
    expect(r.words).toBe(5);
  });

  it("多行文本行数正确", () => {
    const r = countStats("line1\nline2\nline3");
    expect(r.lines).toBe(3);
  });

  it("阅读时长下限为 1 分钟", () => {
    const r = countStats("短");
    expect(r.readingMinutes).toBe(1);
  });

  it("阅读时长按 300 字/分钟向上取整", () => {
    const text = "字".repeat(750);
    const r = countStats(text);
    expect(r.readingMinutes).toBe(3); // 750 / 300 = 2.5 → 3
  });

  it("空白字符串不计词数", () => {
    const r = countStats("   \n\t  \n");
    expect(r.words).toBe(0);
  });
});
