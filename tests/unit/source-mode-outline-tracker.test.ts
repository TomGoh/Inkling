import { describe, expect, it } from "vitest";
import {
  findActiveHeadingIndex,
  findActiveMarkdownHeadingIndexByLine,
  extractMarkdownOutline,
} from "../../src/lib/outline";

describe("source mode outline tracking", () => {
  const md = `# 章节 1

这是第一章内容。

## 小节 1.1

小节内容。

# 章节 2

第二章内容。

### 小节 2.1.1

深度小节。`;

  const headings = extractMarkdownOutline(md);

  it("findActiveHeadingIndex 按字符 offset 正确二分定位", () => {
    // 0: # 章节 1
    expect(findActiveHeadingIndex(headings, 0)).toBe(0);
    expect(findActiveHeadingIndex(headings, 10)).toBe(0);

    // 小节 1.1 的 offset
    const h11Offset = md.indexOf("## 小节 1.1");
    expect(findActiveHeadingIndex(headings, h11Offset)).toBe(1);
    expect(findActiveHeadingIndex(headings, h11Offset + 5)).toBe(1);

    // 章节 2 的 offset
    const h2Offset = md.indexOf("# 章节 2");
    expect(findActiveHeadingIndex(headings, h2Offset)).toBe(2);

    // 小节 2.1.1 的 offset
    const h211Offset = md.indexOf("### 小节 2.1.1");
    expect(findActiveHeadingIndex(headings, h211Offset)).toBe(3);
    expect(findActiveHeadingIndex(headings, md.length)).toBe(3);
  });

  it("findActiveMarkdownHeadingIndexByLine 按行号正确定位", () => {
    const lines = md.split("\n");
    // 第 1 行: # 章节 1 (line = 1)
    expect(findActiveMarkdownHeadingIndexByLine(headings, 1)).toBe(0);
    expect(findActiveMarkdownHeadingIndexByLine(headings, 3)).toBe(0);

    // 找到 ## 小节 1.1 的 line
    const h11Line = lines.findIndex((l) => l.includes("## 小节 1.1")) + 1;
    expect(findActiveMarkdownHeadingIndexByLine(headings, h11Line)).toBe(1);

    // 找到 # 章节 2 的 line
    const h2Line = lines.findIndex((l) => l.includes("# 章节 2")) + 1;
    expect(findActiveMarkdownHeadingIndexByLine(headings, h2Line)).toBe(2);

    // 找到 ### 小节 2.1.1 的 line
    const h211Line = lines.findIndex((l) => l.includes("### 小节 2.1.1")) + 1;
    expect(findActiveMarkdownHeadingIndexByLine(headings, h211Line)).toBe(3);
    expect(findActiveMarkdownHeadingIndexByLine(headings, lines.length + 10)).toBe(3);
  });
});
