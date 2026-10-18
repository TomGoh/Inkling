// #297 标题锚点表与匹配
//
// 覆盖四类真实来源：
// 1) 本应用 slug（中文 / 含标点 / 版本号）；
// 2) GitHub 重复标题锚点（`x-1`，1-based）；
// 3) Milkdown DOM id（`x-#1`）；
// 4) 百分号编码锚点（含非法编码不抛异常）。
//
// 重点：重复标题必须命中「第 2 处」而不是「随便一处」；`#Step 1` 不得被误当成
// 「Step 的第 1 个重复」；只有 2 处 `x` 时 `#x-9` 必须 null。

import { describe, it, expect } from "vitest";
import {
  buildHeadingAnchors,
  matchHeadingAnchor,
  type HeadingInput,
} from "../../src/lib/heading-anchors";

const HEADINGS: HeadingInput[] = [
  { level: 1, text: "链接锚点示例" },
  { level: 2, text: "理解问题与方法" },
  { level: 2, text: "Hello, World!" },
  { level: 2, text: "重复标题" },
  { level: 2, text: "重复标题" },
  { level: 2, text: "Hello, World!" },
  { level: 2, text: "v2.0 release" },
];

const ANCHORS = buildHeadingAnchors(HEADINGS);

/** 匹配结果的下标；未命中返回 null */
function matchIndex(fragment: string): number | null {
  return matchHeadingAnchor(ANCHORS, fragment)?.index ?? null;
}

describe("#297 buildHeadingAnchors", () => {
  it("按 baseSlug 统计 occurrence，且层级变化不重置", () => {
    expect(ANCHORS.map((a) => a.occurrence)).toEqual([0, 0, 0, 0, 1, 1, 0]);
    expect(ANCHORS[2].baseSlug).toBe("hello-world");
    expect(ANCHORS[5].baseSlug).toBe("hello-world");
    expect(ANCHORS[6].baseSlug).toBe("v20-release");
  });

  it("index 保留传入数组下标（空标题被跳过但下标不重排）", () => {
    const anchors = buildHeadingAnchors([
      { level: 2, text: "   " },
      { level: 3, text: "真实标题" },
    ]);
    expect(anchors).toHaveLength(1);
    expect(anchors[0].index).toBe(1);
    expect(anchors[0].level).toBe(3);
  });

  it("domId 缺省退化为 baseSlug，显式 id 原样保留", () => {
    const anchors = buildHeadingAnchors([
      { level: 2, text: "标题" },
      { level: 2, text: "标题", id: "标题-#1" },
    ]);
    expect(anchors[0].domId).toBe("标题");
    expect(anchors[1].domId).toBe("标题-#1");
  });
});

describe("#297 matchHeadingAnchor", () => {
  const cases: Array<[string, string, number | null]> = [
    // —— 本应用 slug ——
    ["中文同文本锚点", "理解问题与方法", 1],
    ["含标点标题的 slug 形态", "hello-world", 2],
    ["含标点标题的原始文本（宽容匹配）", "Hello, World!", 2],
    ["大小写不敏感", "HELLO-WORLD", 2],
    ["版本号标题（slug 去点）", "v20-release", 6],
    ["版本号标题的原始文本", "v2.0 release", 6],

    // —— 百分号编码 ——
    [
      "编码后的中文锚点",
      "%E7%90%86%E8%A7%A3%E9%97%AE%E9%A2%98%E4%B8%8E%E6%96%B9%E6%B3%95",
      1,
    ],
    ["非法编码不抛异常、按原样比较后返回 null", "%E7%90", null],

    // —— 重复标题三种形态 ——
    ["GitHub 序号：hello 的第 2 处", "hello-world-1", 5],
    ["GitHub 原始文本 + 序号（base 必须过 slugify）", "Hello, World!-1", 5],
    ["Milkdown 兼容别名：#1 对应第 2 处", "hello-world-#1", 5],
    ["中文重复标题：第 1 处", "重复标题", 3],
    ["中文重复标题：第 2 处（GitHub 形）", "重复标题-1", 4],
    ["中文重复标题：第 2 处（Milkdown 形）", "重复标题-#1", 4],

    // —— 未命中 ——
    ["不存在的锚点", "不存在的锚点", null],
    ["空片段", "", null],
    ["纯空白片段", "   ", null],
  ];

  it.each(cases)("%s", (_label, fragment, expected) => {
    expect(matchIndex(fragment)).toBe(expected);
  });

  it("序号严格存在：单处含标点标题不会被 x-1 命中", () => {
    const single = buildHeadingAnchors([{ level: 2, text: "Hello, World!" }]);
    expect(matchHeadingAnchor(single, "hello-world-1")).toBeNull();
  });

  it("真实 Milkdown DOM id（1-based 计数，第 2 处为 `-#2`）经精确 id 命中", () => {
    const withIds = buildHeadingAnchors([
      { level: 2, text: "重复标题", id: "重复标题" },
      { level: 2, text: "重复标题", id: "重复标题-#2" },
      { level: 2, text: "重复标题", id: "重复标题-#3" },
    ]);
    expect(matchHeadingAnchor(withIds, "重复标题-#2")?.index).toBe(1);
    expect(matchHeadingAnchor(withIds, "重复标题-#3")?.index).toBe(2);
    // 文档兼容别名仍按 occurrence 解析（`-#1` 不是上游会生成的形态）
    expect(matchHeadingAnchor(withIds, "重复标题-#1")?.index).toBe(1);
  });

  it("序号越界：只有 2 处 x 时 x-9 返回 null（严格存在，不回退到第 1 处）", () => {
    const xs = buildHeadingAnchors([
      { level: 2, text: "x" },
      { level: 2, text: "x" },
    ]);
    expect(matchHeadingAnchor(xs, "x-1")?.index).toBe(1);
    expect(matchHeadingAnchor(xs, "x-9")).toBeNull();
  });

  it("原始 slug 优先于序号解析：`step-1` 命中标题 `Step 1`，不被解析成第 2 个 Step", () => {
    const anchors = buildHeadingAnchors([
      { level: 2, text: "Step" },
      { level: 2, text: "Step" },
      { level: 2, text: "Step 1" },
    ]);
    // 两者都指向 `Step 1` 标题：若把序号解析提到最前，`step-1` 会错误命中第 2 个 Step（index 1）
    expect(matchHeadingAnchor(anchors, "Step 1")?.index).toBe(2);
    expect(matchHeadingAnchor(anchors, "step-1")?.index).toBe(2);
  });
});
