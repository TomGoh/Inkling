import { describe, expect, it } from "vitest";
import {
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

  it("mapScrollTop 按比例映射", () => {
    expect(mapScrollTop(50, 100, 200)).toBe(100);
    expect(mapScrollTop(0, 100, 200)).toBe(0);
  });

  it("markdownOffsetToProsePos 空文档回退到 1", () => {
    expect(markdownOffsetToProsePos(0, "", 0)).toBe(1);
  });
});
