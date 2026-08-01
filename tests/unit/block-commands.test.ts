// block-commands 块级插入命令测试
// 重点验证：
// - v1.2.6 insertMathBlock：插入空 math_display 节点后自动选中并触发 dblclick 进入编辑模式
// - v1.2.7 修复多项边界 bug：
//   * deleteCurrentBlock 对 NodeSelection（frontmatter/toc/hr）正确删除
//   * insertBlockHere 在文档末尾块不抛 "there is no position after the top-level node"
//   * wrapListBlock 在列表内不重复 wrap（避免 invalid content for node list_item）
//   * wrapBlock/wrapListBlock 在 code_block/atom 节点内不 wrap（避免 content does not fit）

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import { EditorView } from "@milkdown/kit/prose/view";
import {
  insertMathBlock,
  insertInlineMath,
  insertHr,
  deleteCurrentBlock,
  wrapBulletList,
  wrapOrderedList,
  wrapBlockquote,
  turnIntoCodeBlock,
  turnIntoHeading,
  exitListIfNeeded,
} from "../../src/components/Editor/block-commands";

// 构建完整 schema：覆盖所有被测命令涉及的节点类型
function makeSchema() {
  return new Schema({
    nodes: {
      doc: { content: "(paragraph | heading | math_display | math_inline_seq | hr | blockquote | bullet_list | ordered_list | code_block | frontmatter | toc)*" },
      paragraph: {
        group: "block",
        content: "(text | math_inline)*",
        toDOM: () => ["p", 0],
        parseDOM: [{ tag: "p" }],
      },
      text: { group: "inline" },
      math_inline: {
        group: "inline",
        inline: true,
        atom: true,
        attrs: { value: { default: "" } },
        toDOM: () => ["span", 0],
        parseDOM: [{ tag: "span" }],
      },
      // 仅用于让 doc.content 接受 math_inline 顶层块（实际不会出现，占位）
      math_inline_seq: {
        group: "block",
        content: "math_inline",
        toDOM: () => ["div", 0],
        parseDOM: [{ tag: "div.seq" }],
      },
      heading: {
        group: "block",
        content: "text*",
        attrs: { level: { default: 1 } },
        toDOM: () => ["h1", 0],
        parseDOM: [{ tag: "h1" }],
      },
      math_display: {
        group: "block",
        atom: true,
        attrs: { value: { default: "" }, number: { default: null } },
        toDOM: () => ["div", 0],
        parseDOM: [{ tag: "div" }],
      },
      hr: {
        group: "block",
        toDOM: () => ["hr"],
        parseDOM: [{ tag: "hr" }],
      },
      blockquote: {
        group: "block",
        content: "paragraph+",
        toDOM: () => ["blockquote", 0],
        parseDOM: [{ tag: "blockquote" }],
      },
      bullet_list: {
        group: "block",
        content: "list_item+",
        toDOM: () => ["ul", 0],
        parseDOM: [{ tag: "ul" }],
      },
      ordered_list: {
        group: "block",
        content: "list_item+",
        toDOM: () => ["ol", 0],
        parseDOM: [{ tag: "ol" }],
      },
      list_item: {
        content: "paragraph",
        toDOM: () => ["li", 0],
        parseDOM: [{ tag: "li" }],
      },
      code_block: {
        group: "block",
        content: "text*",
        code: true,
        attrs: { language: { default: "text" } },
        toDOM: () => ["pre", ["code", 0]],
        parseDOM: [{ tag: "pre" }],
      },
      frontmatter: {
        group: "block",
        atom: true,
        attrs: { value: { default: "" } },
        toDOM: () => ["div", 0],
        parseDOM: [{ tag: "div" }],
      },
      toc: {
        group: "block",
        atom: true,
        attrs: {},
        toDOM: () => ["div", { "data-toc": "" }],
        parseDOM: [{ tag: "div" }],
      },
    },
  });
}

// 构造假 EditorView
function makeView(schema: Schema, docContent: any[], selection?: { from: number; to?: number }) {
  const doc = schema.nodes.doc.create(null, docContent);
  const state = EditorState.create({
    doc,
    selection: selection
      ? TextSelection.create(doc, selection.from, selection.to ?? selection.from)
      : TextSelection.create(doc, 1),
  });
  const root = document.createElement("div");
  document.body.appendChild(root);
  const view = new EditorView(root, { state });
  view.nodeDOM = vi.fn((pos: number) => {
    const el = document.createElement("div");
    el.dispatchEvent = vi.fn();
    return el;
  }) as any;
  return { view, root };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("insertMathBlock", () => {
  it("在空段落处插入 math_display 节点（替换空段落）", () => {
    const schema = makeSchema();
    const { view } = makeView(schema, [schema.nodes.paragraph.create()]);
    insertMathBlock(view);
    expect(view.state.doc.firstChild?.type.name).toBe("math_display");
    view.destroy();
  });

  it("插入后调度 NodeSelection 选中新节点（requestAnimationFrame）", () => {
    const schema = makeSchema();
    const { view } = makeView(schema, [schema.nodes.paragraph.create()]);
    insertMathBlock(view);
    expect(view.state.doc.firstChild?.type.name).toBe("math_display");
    vi.runAllTimers();
    expect(view.state.selection instanceof NodeSelection).toBe(true);
    if (view.state.selection instanceof NodeSelection) {
      expect(view.state.selection.from).toBe(0);
    }
    view.destroy();
  });

  it("插入后触发 dblclick 事件进入编辑模式（nodeDOM.dispatchEvent 被调用）", () => {
    const schema = makeSchema();
    const { view } = makeView(schema, [schema.nodes.paragraph.create()]);
    insertMathBlock(view);
    vi.runAllTimers();
    expect(view.nodeDOM).toHaveBeenCalled();
    view.destroy();
  });

  it("在非空段落插入 math_display（插到当前块之后）", () => {
    const schema = makeSchema();
    const para = schema.nodes.paragraph.create(null, [schema.text("hello")]);
    const { view } = makeView(schema, [para]);
    insertMathBlock(view);
    expect(view.state.doc.child(0).type.name).toBe("paragraph");
    expect(view.state.doc.child(1).type.name).toBe("math_display");
    view.destroy();
  });

  it("在文档最后一个块（非空段落）插入不抛错（v1.2.7 修复 there is no position after top-level node）", () => {
    const schema = makeSchema();
    const para = schema.nodes.paragraph.create(null, [schema.text("end")]);
    const { view } = makeView(schema, [para], { from: 4 });
    expect(() => insertMathBlock(view)).not.toThrow();
    // math_display 应插到末尾
    expect(view.state.doc.lastChild?.type.name).toBe("math_display");
    view.destroy();
  });

  it("schema 无 math_display 时不报错（静默返回）", () => {
    const schema = new Schema({
      nodes: {
        doc: { content: "paragraph*" },
        paragraph: {
          group: "block",
          content: "text*",
          toDOM: () => ["p", 0],
          parseDOM: [{ tag: "p" }],
        },
        text: { group: "inline" },
      },
    });
    const { view } = makeView(schema, [schema.nodes.paragraph.create()]);
    expect(() => insertMathBlock(view)).not.toThrow();
    view.destroy();
  });
});

describe("insertHr（对照组）", () => {
  it("在空段落处插入 hr 节点", () => {
    const schema = makeSchema();
    const { view } = makeView(schema, [schema.nodes.paragraph.create()]);
    insertHr(view);
    expect(view.state.doc.firstChild?.type.name).toBe("hr");
    view.destroy();
  });

  it("在文档最后一个块插入 hr 不抛错（v1.2.7 修复）", () => {
    const schema = makeSchema();
    const para = schema.nodes.paragraph.create(null, [schema.text("end")]);
    const { view } = makeView(schema, [para], { from: 4 });
    expect(() => insertHr(view)).not.toThrow();
    expect(view.state.doc.lastChild?.type.name).toBe("hr");
    view.destroy();
  });
});

describe("deleteCurrentBlock", () => {
  it("通过 NodeSelection 删除 frontmatter（点击元数据后删除）", () => {
    const schema = makeSchema();
    const fm = schema.nodes.frontmatter.create({ value: "title: test" });
    const para = schema.nodes.paragraph.create(null, [schema.text("正文")]);
    const doc = schema.nodes.doc.create(null, [fm, para]);
    const state = EditorState.create({
      doc,
      selection: NodeSelection.create(doc, 0),
    });
    const root = document.createElement("div");
    document.body.appendChild(root);
    const view = new EditorView(root, { state });
    deleteCurrentBlock(view);
    // frontmatter 应被删除，只剩 paragraph
    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.doc.firstChild?.type.name).toBe("paragraph");
    view.destroy();
  });

  it("通过 NodeSelection 删除 toc（点击目录块后删除）", () => {
    const schema = makeSchema();
    const toc = schema.nodes.toc.create();
    const para = schema.nodes.paragraph.create(null, [schema.text("正文")]);
    const doc = schema.nodes.doc.create(null, [toc, para]);
    const state = EditorState.create({
      doc,
      selection: NodeSelection.create(doc, 0),
    });
    const root = document.createElement("div");
    document.body.appendChild(root);
    const view = new EditorView(root, { state });
    deleteCurrentBlock(view);
    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.doc.firstChild?.type.name).toBe("paragraph");
    view.destroy();
  });

  it("通过 NodeSelection 删除 hr", () => {
    const schema = makeSchema();
    const para1 = schema.nodes.paragraph.create(null, [schema.text("第一段")]);
    const hr = schema.nodes.hr.create();
    const para2 = schema.nodes.paragraph.create(null, [schema.text("第二段")]);
    const doc = schema.nodes.doc.create(null, [para1, hr, para2]);
    const state = EditorState.create({
      doc,
      selection: NodeSelection.create(doc, para1.nodeSize),
    });
    const root = document.createElement("div");
    document.body.appendChild(root);
    const view = new EditorView(root, { state });
    deleteCurrentBlock(view);
    // hr 应被删除，剩 para1 和 para2
    expect(view.state.doc.childCount).toBe(2);
    expect(view.state.doc.child(0).type.name).toBe("paragraph");
    expect(view.state.doc.child(1).type.name).toBe("paragraph");
    view.destroy();
  });

  it("通过 TextSelection 删除普通段落", () => {
    const schema = makeSchema();
    const para1 = schema.nodes.paragraph.create(null, [schema.text("第一段")]);
    const para2 = schema.nodes.paragraph.create(null, [schema.text("第二段")]);
    const { view } = makeView(schema, [para1, para2], { from: 1 });
    deleteCurrentBlock(view);
    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.doc.firstChild?.textContent).toBe("第二段");
    view.destroy();
  });

  it("删除唯一块后补空段落（文档不为空）", () => {
    const schema = makeSchema();
    const para = schema.nodes.paragraph.create(null, [schema.text("唯一")]);
    const { view } = makeView(schema, [para], { from: 1 });
    deleteCurrentBlock(view);
    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.doc.firstChild?.type.name).toBe("paragraph");
    expect(view.state.doc.firstChild?.content.size).toBe(0);
    view.destroy();
  });

  it("删除第一个块（topPos=0）光标定位不抛错", () => {
    const schema = makeSchema();
    const para1 = schema.nodes.paragraph.create(null, [schema.text("第一")]);
    const para2 = schema.nodes.paragraph.create(null, [schema.text("第二")]);
    const { view } = makeView(schema, [para1, para2], { from: 1 });
    expect(() => deleteCurrentBlock(view)).not.toThrow();
    expect(view.state.doc.firstChild?.textContent).toBe("第二");
    view.destroy();
  });
});

describe("wrapListBlock / wrapBlockquote 边界修复", () => {
  it("在普通段落 wrap 无序列表", () => {
    const schema = makeSchema();
    const para = schema.nodes.paragraph.create(null, [schema.text("hello")]);
    const { view } = makeView(schema, [para], { from: 1 });
    wrapBulletList(view);
    expect(view.state.doc.firstChild?.type.name).toBe("bullet_list");
    view.destroy();
  });

  it("已在列表内时再点列表不重复 wrap（v1.2.7 修复 invalid content for node list_item）", () => {
    const schema = makeSchema();
    const para = schema.nodes.paragraph.create(null, [schema.text("item")]);
    const li = schema.nodes.list_item.create(null, [para]);
    const ul = schema.nodes.bullet_list.create(null, [li]);
    // doc: ul(0) > li(1) > para(2) > text(3..7)
    // paragraph 内部光标在 pos=3
    const { view } = makeView(schema, [ul], { from: 3 });
    expect(() => wrapBulletList(view)).not.toThrow();
    // 不产生嵌套，仍是单层 bullet_list
    expect(view.state.doc.firstChild?.type.name).toBe("bullet_list");
    expect(view.state.doc.firstChild?.childCount).toBe(1);
    view.destroy();
  });

  it("已在无序列表内点有序列表不报错", () => {
    const schema = makeSchema();
    const para = schema.nodes.paragraph.create(null, [schema.text("item")]);
    const li = schema.nodes.list_item.create(null, [para]);
    const ul = schema.nodes.bullet_list.create(null, [li]);
    const { view } = makeView(schema, [ul], { from: 3 });
    expect(() => wrapOrderedList(view)).not.toThrow();
    view.destroy();
  });

  it("在 code_block 内点列表不报错（v1.2.7 修复 content does not fit in gap）", () => {
    const schema = makeSchema();
    const cb = schema.nodes.code_block.create(null, [schema.text("code")]);
    // doc: code_block(0) > text(1..5)，光标在 code_block 内部 pos=1
    const { view } = makeView(schema, [cb], { from: 1 });
    expect(() => wrapBulletList(view)).not.toThrow();
    // code_block 不被 wrap，仍是 code_block
    expect(view.state.doc.firstChild?.type.name).toBe("code_block");
    view.destroy();
  });

  it("在 code_block 内点引用不报错", () => {
    const schema = makeSchema();
    const cb = schema.nodes.code_block.create(null, [schema.text("code")]);
    const { view } = makeView(schema, [cb], { from: 1 });
    expect(() => wrapBlockquote(view)).not.toThrow();
    expect(view.state.doc.firstChild?.type.name).toBe("code_block");
    view.destroy();
  });

  it("在 atom 节点（math_display）上点列表不报错", () => {
    const schema = makeSchema();
    const math = schema.nodes.math_display.create({ value: "x^2" });
    const para = schema.nodes.paragraph.create();
    const doc = schema.nodes.doc.create(null, [math, para]);
    const state = EditorState.create({
      doc,
      selection: NodeSelection.create(doc, 0),
    });
    const root = document.createElement("div");
    document.body.appendChild(root);
    const view = new EditorView(root, { state });
    expect(() => wrapBulletList(view)).not.toThrow();
    view.destroy();
  });
});

// v1.2.8 新增：行内公式插入、列表内退出后转换块类型
describe("insertInlineMath（v1.2.8）", () => {
  it("在段落光标处插入 math_inline 节点", () => {
    const schema = makeSchema();
    const para = schema.nodes.paragraph.create(null, [schema.text("ab")]);
    // doc: paragraph(0) > text "ab"(1..3)，光标在 pos=2（a 与 b 之间）
    const { view } = makeView(schema, [para], { from: 2 });
    insertInlineMath(view);
    // 段落内应含 text + math_inline
    const paraNode = view.state.doc.firstChild!;
    const types: string[] = [];
    paraNode.content.forEach((c: any) => types.push(c.type.name));
    expect(types).toContain("math_inline");
    view.destroy();
  });

  it("插入后调度 NodeSelection 选中行内公式（requestAnimationFrame）", () => {
    const schema = makeSchema();
    const para = schema.nodes.paragraph.create(null, [schema.text("ab")]);
    const { view } = makeView(schema, [para], { from: 2 });
    insertInlineMath(view);
    vi.runAllTimers();
    expect(view.state.selection instanceof NodeSelection).toBe(true);
    view.destroy();
  });

  it("schema 无 math_inline 时静默返回不抛错", () => {
    const schema = new Schema({
      nodes: {
        doc: { content: "paragraph*" },
        paragraph: {
          group: "block",
          content: "text*",
          toDOM: () => ["p", 0],
          parseDOM: [{ tag: "p" }],
        },
        text: { group: "inline" },
      },
    });
    const para = schema.nodes.paragraph.create(null, [schema.text("x")]);
    const { view } = makeView(schema, [para], { from: 1 });
    expect(() => insertInlineMath(view)).not.toThrow();
    view.destroy();
  });
});

describe("exitListIfNeeded / 列表内转换块类型（v1.2.8）", () => {
  it("在列表内调用 exitListIfNeeded 后追加空段落并移出光标", () => {
    const schema = makeSchema();
    const para = schema.nodes.paragraph.create(null, [schema.text("item")]);
    const li = schema.nodes.list_item.create(null, [para]);
    const ul = schema.nodes.bullet_list.create(null, [li]);
    const { view } = makeView(schema, [ul], { from: 3 });
    const exited = exitListIfNeeded(view);
    expect(exited).toBe(true);
    // doc 应变成 bullet_list + paragraph
    expect(view.state.doc.childCount).toBe(2);
    expect(view.state.doc.child(0).type.name).toBe("bullet_list");
    expect(view.state.doc.child(1).type.name).toBe("paragraph");
    view.destroy();
  });

  it("不在列表内时 exitListIfNeeded 返回 false", () => {
    const schema = makeSchema();
    const para = schema.nodes.paragraph.create(null, [schema.text("hello")]);
    const { view } = makeView(schema, [para], { from: 1 });
    expect(exitListIfNeeded(view)).toBe(false);
    view.destroy();
  });

  it("列表内点代码块按钮不报错（v1.2.8 修复 invalid content for node list_item）", () => {
    const schema = makeSchema();
    const para = schema.nodes.paragraph.create(null, [schema.text("item")]);
    const li = schema.nodes.list_item.create(null, [para]);
    const ul = schema.nodes.bullet_list.create(null, [li]);
    const { view } = makeView(schema, [ul], { from: 3 });
    expect(() => turnIntoCodeBlock(view)).not.toThrow();
    // 转换发生在退出列表后的新段落上，list 保留，后接 code_block
    expect(view.state.doc.child(0).type.name).toBe("bullet_list");
    expect(view.state.doc.child(1).type.name).toBe("code_block");
    view.destroy();
  });

  it("列表内点标题按钮不报错", () => {
    const schema = makeSchema();
    const para = schema.nodes.paragraph.create(null, [schema.text("item")]);
    const li = schema.nodes.list_item.create(null, [para]);
    const ol = schema.nodes.ordered_list.create(null, [li]);
    const { view } = makeView(schema, [ol], { from: 3 });
    expect(() => turnIntoHeading(view, 2)).not.toThrow();
    expect(view.state.doc.child(0).type.name).toBe("ordered_list");
    expect(view.state.doc.child(1).type.name).toBe("heading");
    view.destroy();
  });
});

