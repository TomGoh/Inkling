// 写盘前文档规整单测（#268 / #272 / #284 / #286）
//
// 覆盖对象：`normalizeListPlaceholders`——序列化前的列表项规整，两条规则：
//   1. 剔除列表项首部的结构占位空段落（#268）；任务项除外——保留段落并填非空锚点（#286）；
//   2. 空列表项改写成 html 锚点，序列化成裸标记（#272）；其中任务项用**非空**锚点
//      保住 checkbox（#284）。
// 文档用真实 Milkdown 解析器构造（占位段落是 parser + schema 共同补出来的，
// 手工搭 PM 节点无法保证与生产同形），断言面为「规整后的节点形态 + 序列化文本」。
//
// 复现路径见 issue #268 / #272 / #284 / #286：
//   #268：`- - a`（首块是子列表）保存一次后变成 `"* <br />\n\n  * a\n"`；
//   #272：`-`（空列表项）保存一次后变成 `"* <br />\n"`；
//   #284：`- [ ] 待办` 删空文本后保存，变成 `"* [ ] <br />\n"`；
//   #286：`- [ ] 待办\n  - 子项` 删空正文后保存，变成 `"* * 子项\n"`（checkbox 丢，比字面 `<br />` 更糟）。
//   前三者都把字面 `<br />` 落进用户 Markdown 源文件；#286 是勾选项永久退化成普通列表。

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { Fragment } from "@milkdown/kit/prose/model";
import { createHarness, type Harness } from "../fixtures/smartPasteHarness";
import { normalizeListPlaceholders } from "../../src/components/Editor/markdown-serialize";

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

/** 把第一个 list_item 的段落清空，构造「空列表项」（checked 保留原值） */
function emptyFirstItem(doc: PMNode): PMNode {
  const item = firstItem(doc);
  const paragraph = item.firstChild!;
  const emptyParagraph = paragraph.type.create(paragraph.attrs, Fragment.empty);
  const emptyItem = item.copy(Fragment.fromArray([emptyParagraph]));
  return doc.copy(
    Fragment.fromArray([doc.firstChild!.copy(Fragment.fromArray([emptyItem]))]),
  );
}

describe("normalizeListPlaceholders（#268 首块是子列表的占位空段落）", () => {
  it("剔除首块是子列表的列表项的占位空段落，序列化不再出现字面 <br />", () => {
    const doc = h.parse("- - a");
    // 解析结果：占位空段落 + 子列表（schema `paragraph block*` 强制）
    expect(firstItem(doc).childCount).toBe(2);
    expect(firstItem(doc).firstChild?.type.name).toBe("paragraph");
    expect(firstItem(doc).firstChild?.content.size).toBe(0);
    expect(h.serialize(doc)).toBe("* <br />\n\n  * a\n");

    const stripped = normalizeListPlaceholders(doc);
    expect(stripped).not.toBe(doc);
    expect(firstItem(stripped).childCount).toBe(1);
    expect(firstItem(stripped).firstChild?.type.name).toBe("bullet_list");
    expect(h.serialize(stripped)).toBe("* * a\n");
    expect(h.serialize(stripped)).not.toContain("<br");
  });

  it("有序子列表作首块：起始编号保留，同样不出现 <br />", () => {
    const stripped = normalizeListPlaceholders(h.parse("- 3. a"));
    expect(h.serialize(stripped)).toBe("* 3. a\n");
  });

  it("结构无损：剔除后的文本重新解析，文档与剔除前完全一致（含 spread）", () => {
    const doc = h.parse("- - a");
    const stripped = normalizeListPlaceholders(doc);
    expect(JSON.stringify(h.parse(h.serialize(stripped)).toJSON())).toBe(JSON.stringify(doc.toJSON()));
  });

  it("二次序列化幂等：剔除 → 序列化 → 解析 → 再剔除 → 序列化结果不变", () => {
    const once = h.serialize(normalizeListPlaceholders(h.parse("- - a\n  <!-- -->\n  - b")));
    const twice = h.serialize(normalizeListPlaceholders(h.parse(once)));
    expect(once).toBe("* * a\n\n  <!-- -->\n\n  * b\n");
    expect(twice).toBe(once);
  });

  it("嵌套在深层列表项内的占位段落同样被剔除", () => {
    const stripped = normalizeListPlaceholders(h.parse("- x\n  - - a"));
    expect(h.serialize(stripped)).toBe("* x\n\n  * * a\n");
  });

  it("没有占位段落时原样返回同一个 doc 实例（不做任何重建）", () => {
    for (const md of ["- x\n  - a", "- a\n- b", "1. x\n   1. a", "- a\n\n  c", "正文", ""]) {
      const doc = h.parse(md);
      expect(normalizeListPlaceholders(doc), md).toBe(doc);
    }
  });

  it("列表项中间的空段落（用户手写的空行）仍按原文保留 <br />", () => {
    const md = "- a\n\n  <br />\n\n  b";
    const doc = h.parse(md);
    expect(normalizeListPlaceholders(doc)).toBe(doc);
    expect(h.serialize(doc)).toBe("* a\n\n  <br />\n\n  b\n");
  });
});

// #286：任务项的**首部空段落**（文本被删空、但后面还有子列表）不能被当占位段落剔除——
// GFM 的 checkbox 前缀要求 listItem.children[0] 是段落，剔除后前缀整块丢失（勾选项永久退化成普通列表）。
describe("normalizeListPlaceholders（#286 空任务列表项 + 子列表）", () => {
  /** 把第一个 list_item 的**首个段落**清空、保留其余块，构造「任务项首部空段落」形态 */
  function emptyFirstParagraph(doc: PMNode): PMNode {
    const item = firstItem(doc);
    const paragraph = item.firstChild!;
    const children: PMNode[] = [];
    item.forEach((child, _offset, index) => {
      children.push(index === 0 ? paragraph.type.create(paragraph.attrs, Fragment.empty) : child);
    });
    const emptied = item.copy(Fragment.fromArray(children));
    return doc.copy(Fragment.fromArray([doc.firstChild!.copy(Fragment.fromArray([emptied]))]));
  }

  it("首部空段落保留并填非空锚点：checkbox 不丢、子列表仍在、无字面 <br />", () => {
    const doc = emptyFirstParagraph(h.parse("- [ ] 待办\n  - 子项"));
    expect(firstItem(doc).attrs.checked).toBe(false);
    expect(firstItem(doc).childCount).toBe(2);
    // 规整前：checkbox 在，但段落被写成字面 <br />
    expect(h.serialize(doc)).toBe("* [ ] <br />\n  * 子项\n");

    const normalized = normalizeListPlaceholders(doc);
    expect(normalized).not.toBe(doc);
    expect(h.serialize(normalized)).toBe("* [ ] <!-- -->\n  * 子项\n");
    expect(h.serialize(normalized)).not.toContain("<br");
  });

  it("重新解析后仍是勾选项（checkbox 未退化），二次序列化幂等", () => {
    const doc = emptyFirstParagraph(h.parse("- [ ] 待办\n  - 子项"));
    const once = h.serialize(normalizeListPlaceholders(doc));
    const doc2 = h.parse(once);
    expect(firstItem(doc2).attrs.checked).toBe(false);
    expect(firstItem(doc2).childCount).toBe(2);
    expect(h.serialize(normalizeListPlaceholders(doc2))).toBe(once);
  });

  it("已勾选与有序任务项 + 子列表同样保住勾选态", () => {
    expect(h.serialize(normalizeListPlaceholders(emptyFirstParagraph(h.parse("- [x] 待办\n  - 子项"))))).toBe(
      "* [x] <!-- -->\n  * 子项\n",
    );
    expect(
      h.serialize(normalizeListPlaceholders(emptyFirstParagraph(h.parse("1. [ ] 待办\n   1. 子项")))),
    ).toBe("1. [ ] <!-- -->\n   1. 子项\n");
  });

  it("非任务项的占位空段落仍照 #268 剔除（不受本修复影响）", () => {
    const stripped = normalizeListPlaceholders(h.parse("- - a"));
    expect(h.serialize(stripped)).toBe("* * a\n");
  });
});

describe("normalizeListPlaceholders（#272 空列表项）", () => {
  it("空列表项（裸标记 `-`）序列化成裸标记，不再出现字面 <br />", () => {
    const doc = h.parse("-");
    // 解析结果：唯一子节点是空段落
    expect(firstItem(doc).childCount).toBe(1);
    expect(firstItem(doc).firstChild?.type.name).toBe("paragraph");
    expect(firstItem(doc).firstChild?.content.size).toBe(0);
    expect(h.serialize(doc)).toBe("* <br />\n");

    const normalized = normalizeListPlaceholders(doc);
    expect(normalized).not.toBe(doc);
    expect(h.serialize(normalized)).toBe("*\n");
    expect(h.serialize(normalized)).not.toContain("<br");
  });

  it("有序空列表项同样输出裸标记（起始编号保留）", () => {
    expect(h.serialize(normalizeListPlaceholders(h.parse("1.")))).toBe("1.\n");
  });

  it("空列表项夹在非空项之间/前后", () => {
    expect(h.serialize(normalizeListPlaceholders(h.parse("- a\n-")))).toBe("* a\n\n*\n");
    expect(h.serialize(normalizeListPlaceholders(h.parse("-\n- a")))).toBe("*\n\n* a\n");
    expect(h.serialize(normalizeListPlaceholders(h.parse("1. a\n2.")))).toBe("1. a\n2.\n");
  });

  it("改动只体现为去掉 ` <br />`：其余字符与规整前逐字一致", () => {
    // 多列表项时 mdast-util-to-markdown 会在项间插空行（`- a\n- b` 亦然），
    // 那是既有行为、与本修复无关；这里锁住「除 <br /> 外没有任何其它变化」
    for (const md of ["- a\n-", "1. a\n2.", "- a\n-\n- b", "- a\n- b"]) {
      const doc = h.parse(md);
      expect(h.serialize(normalizeListPlaceholders(doc)), md).toBe(
        h.serialize(doc).replace(" <br />", ""),
      );
    }
  });

  it("结构无损：单个空列表项的裸标记重新解析后与规整前的文档完全一致（含 spread / checked）", () => {
    for (const md of ["-", "1."]) {
      const doc = h.parse(md);
      const reparsed = h.parse(h.serialize(normalizeListPlaceholders(doc)));
      expect(JSON.stringify(reparsed.toJSON()), md).toBe(JSON.stringify(doc.toJSON()));
    }
  });

  it("二次序列化幂等：规整 → 序列化 → 解析 → 再规整 → 序列化结果不变", () => {
    const once = h.serialize(normalizeListPlaceholders(h.parse("*\n")));
    const twice = h.serialize(normalizeListPlaceholders(h.parse(once)));
    expect(once).toBe("*\n");
    expect(twice).toBe(once);
  });

  it("非空列表项与其它块级节点不受影响", () => {
    for (const md of ["- a\n- b", "1. a", "- x\n  - a", "- [ ] 待办", "> 引用", "正文", ""]) {
      const doc = h.parse(md);
      expect(normalizeListPlaceholders(doc), md).toBe(doc);
      expect(h.serialize(normalizeListPlaceholders(doc)), md).toBe(h.serialize(doc));
    }
  });

  it("两种形态同时存在时各按各的规则处理", () => {
    const doc = h.parse("- - a\n-");
    const normalized = normalizeListPlaceholders(doc);
    expect(h.serialize(normalized)).toBe("* * a\n\n*\n");
    expect(h.serialize(normalized)).not.toContain("<br");
  });
});

describe("normalizeListPlaceholders（#284 空任务列表项）", () => {
  it("空任务项用非空锚点：序列化成 `* [ ] <!-- -->`，checkbox 不丢、无字面 <br />", () => {
    // 空任务项来自「把任务项文本删空」；mdast 侧靠裸标记后的空格插入 `[ ] `，
    // 空值锚点会让正则匹配不上、checkbox 直接丢失（实测 `* [ ] <br />` → `*`），故用 `<!-- -->`
    const doc = emptyFirstItem(h.parse("- [ ] 待办"));
    expect(firstItem(doc).attrs.checked).toBe(false);
    expect(h.serialize(doc)).toBe("* [ ] <br />\n");

    const normalized = normalizeListPlaceholders(doc);
    expect(normalized).not.toBe(doc);
    expect(h.serialize(normalized)).toBe("* [ ] <!-- -->\n");
    expect(h.serialize(normalized)).not.toContain("<br");
  });

  it("已勾选（`[x]`）的空任务项同样保住勾选态，有序任务项保留起始编号", () => {
    expect(h.serialize(normalizeListPlaceholders(emptyFirstItem(h.parse("- [x] 完成"))))).toBe(
      "* [x] <!-- -->\n",
    );
    expect(h.serialize(normalizeListPlaceholders(emptyFirstItem(h.parse("1. [ ] 待办"))))).toBe(
      "1. [ ] <!-- -->\n",
    );
  });

  it("二次序列化幂等，且不再是同实例（确有重建）", () => {
    const once = h.serialize(normalizeListPlaceholders(emptyFirstItem(h.parse("- [ ] 待办"))));
    const twice = h.serialize(normalizeListPlaceholders(h.parse(once)));
    expect(once).toBe("* [ ] <!-- -->\n");
    expect(twice).toBe(once);
  });
});
