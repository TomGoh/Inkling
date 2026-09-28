// 写盘前文档规整单测（#268）
//
// 覆盖对象：`stripListPlaceholderParagraphs`——序列化前剔除列表项首部的结构占位空段落。
// 文档用真实 Milkdown 解析器构造（占位段落是 parser + schema 共同补出来的，
// 手工搭 PM 节点无法保证与生产同形），断言面为「剔除后的节点形态 + 序列化文本」。
//
// 复现路径见 issue #268：`- - a`（首块是子列表）保存一次后变成
// `"* <br />\n\n  * a\n"`——字面 `<br />` 落进用户 Markdown 源文件。

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { createHarness, type Harness } from "../fixtures/smartPasteHarness";
import { stripListPlaceholderParagraphs } from "../../src/components/Editor/markdown-serialize";

let h: Harness;

beforeAll(async () => {
  h = await createHarness({ markdown: "" });
});

afterAll(async () => {
  await h.destroy();
});

/** 第一个 list_item */
function firstItem(doc: PMNode): PMNode {
  let found: PMNode | undefined;
  doc.descendants((node) => {
    if (found) return false;
    if (node.type.name === "list_item") {
      found = node;
      return false;
    }
    return true;
  });
  if (!found) throw new Error("文档里没有 list_item");
  return found;
}

describe("stripListPlaceholderParagraphs（#268）", () => {
  it("剔除首块是子列表的列表项的占位空段落，序列化不再出现字面 <br />", () => {
    const doc = h.parse("- - a");
    // 解析结果：占位空段落 + 子列表（schema `paragraph block*` 强制）
    expect(firstItem(doc).childCount).toBe(2);
    expect(firstItem(doc).firstChild?.type.name).toBe("paragraph");
    expect(firstItem(doc).firstChild?.content.size).toBe(0);
    expect(h.serialize(doc)).toBe("* <br />\n\n  * a\n");

    const stripped = stripListPlaceholderParagraphs(doc);
    expect(stripped).not.toBe(doc);
    expect(firstItem(stripped).childCount).toBe(1);
    expect(firstItem(stripped).firstChild?.type.name).toBe("bullet_list");
    expect(h.serialize(stripped)).toBe("* * a\n");
    expect(h.serialize(stripped)).not.toContain("<br");
  });

  it("有序子列表作首块：起始编号保留，同样不出现 <br />", () => {
    const stripped = stripListPlaceholderParagraphs(h.parse("- 3. a"));
    expect(h.serialize(stripped)).toBe("* 3. a\n");
  });

  it("结构无损：剔除后的文本重新解析，文档与剔除前完全一致（含 spread）", () => {
    const doc = h.parse("- - a");
    const stripped = stripListPlaceholderParagraphs(doc);
    expect(JSON.stringify(h.parse(h.serialize(stripped)).toJSON())).toBe(JSON.stringify(doc.toJSON()));
  });

  it("二次序列化幂等：剔除 → 序列化 → 解析 → 再剔除 → 序列化结果不变", () => {
    const once = h.serialize(stripListPlaceholderParagraphs(h.parse("- - a\n  <!-- -->\n  - b")));
    const twice = h.serialize(stripListPlaceholderParagraphs(h.parse(once)));
    expect(once).toBe("* * a\n\n  <!-- -->\n\n  * b\n");
    expect(twice).toBe(once);
  });

  it("嵌套在深层列表项内的占位段落同样被剔除", () => {
    const stripped = stripListPlaceholderParagraphs(h.parse("- x\n  - - a"));
    expect(h.serialize(stripped)).toBe("* x\n\n  * * a\n");
  });

  it("没有占位段落时原样返回同一个 doc 实例（不做任何重建）", () => {
    for (const md of ["- x\n  - a", "- a\n- b", "1. x\n   1. a", "- a\n\n  c", "正文", ""]) {
      const doc = h.parse(md);
      expect(stripListPlaceholderParagraphs(doc), md).toBe(doc);
    }
  });

  it("空列表项（裸标记 `-`，空段落是唯一子节点）不属于占位段落，保持原样", () => {
    // 剔除它会让 mdast-util-to-markdown 拿到空 listItem 抛错；该形态出 issue #268 范围
    const doc = h.parse("-");
    expect(firstItem(doc).childCount).toBe(1);
    expect(stripListPlaceholderParagraphs(doc)).toBe(doc);
    expect(h.serialize(doc)).toBe("* <br />\n");
  });

  it("列表项中间的空段落（用户手写的空行）仍按原文保留 <br />", () => {
    const md = "- a\n\n  <br />\n\n  b";
    const doc = h.parse(md);
    expect(stripListPlaceholderParagraphs(doc)).toBe(doc);
    expect(h.serialize(doc)).toBe("* a\n\n  <br />\n\n  b\n");
  });
});
