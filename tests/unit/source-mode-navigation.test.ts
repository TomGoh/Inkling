import { describe, expect, it } from "vitest";
import {
  findSourceModeHeadingOffset,
} from "../../src/lib/outline";
import {
  getSourceModeScroll,
  registerSourceModeScroll,
  runSourceModeScrollToHeading,
  unregisterSourceModeScroll,
} from "../../src/lib/source-mode-scroll";

describe("source-mode-navigation", () => {
  it("findSourceModeHeadingOffset 精确匹配标题位置", () => {
    const md = "# 标题 1\n\n正文 1\n\n## 标题 2\n\n正文 2";
    const heading1 = {
      index: 0,
      level: 1,
      text: "标题 1",
      pos: 0,
      id: "h-0-标题 1",
      nodeId: null,
    };
    const heading2 = {
      index: 1,
      level: 2,
      text: "标题 2",
      pos: 10,
      id: "h-1-标题 2",
      nodeId: null,
    };

    expect(findSourceModeHeadingOffset(md, heading1)).toBe(0);
    expect(findSourceModeHeadingOffset(md, heading2)).toBe(md.indexOf("## 标题 2"));
  });

  it("findSourceModeHeadingOffset 跳过代码块内的伪标题", () => {
    const md = "```\n# 代码块内标题\n```\n\n# 真实标题";
    const heading = {
      index: 0,
      level: 1,
      text: "真实标题",
      pos: 0,
      id: "h-0-真实标题",
      nodeId: null,
    };
    expect(findSourceModeHeadingOffset(md, heading)).toBe(md.indexOf("# 真实标题"));
  });

  it("findSourceModeHeadingOffset 支持同名标题按 index 定位", () => {
    const md = "# 章节\n\n正文 A\n\n# 章节\n\n正文 B";
    const heading0 = {
      index: 0,
      level: 1,
      text: "章节",
      pos: 0,
      id: "h-0-章节",
      nodeId: null,
    };
    const heading1 = {
      index: 1,
      level: 1,
      text: "章节",
      pos: 0,
      id: "h-1-章节",
      nodeId: null,
    };

    expect(findSourceModeHeadingOffset(md, heading0)).toBe(0);
    expect(findSourceModeHeadingOffset(md, heading1)).toBe(md.lastIndexOf("# 章节"));
  });

  it("registerSourceModeScroll 与 runSourceModeScrollToHeading 正常分发", () => {
    let scrolled = false;
    registerSourceModeScroll("/test.md", {
      scrollToHeading: () => {
        scrolled = true;
      },
    });

    const ran = runSourceModeScrollToHeading("/test.md", {
      index: 0,
      level: 1,
      text: "测试",
      pos: 0,
      id: "h-0-测试",
      nodeId: null,
    });
    expect(ran).toBe(true);
    expect(scrolled).toBe(true);

    unregisterSourceModeScroll("/test.md");
    const ranAfter = runSourceModeScrollToHeading("/test.md", {
      index: 0,
      level: 1,
      text: "测试",
      pos: 0,
      id: "h-0-测试",
      nodeId: null,
    });
    expect(ranAfter).toBe(false);
  });

  it("getSourceModeScroll 获取与清理正常工作", () => {
    registerSourceModeScroll("/test.md", {
      scrollToHeading: () => true,
      getScrollAndCursor: () => ({ scrollTop: 150, cursor: 42 }),
    });

    const scroll = getSourceModeScroll("/test.md");
    expect(scroll).toEqual({ scrollTop: 150, cursor: 42 });

    unregisterSourceModeScroll("/test.md");
    expect(getSourceModeScroll("/test.md")).toBeNull();
  });
});
