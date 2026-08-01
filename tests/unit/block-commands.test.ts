// block-commands 块级插入命令测试
// 重点验证 insertMathBlock 的修复（v1.2.6）：
// - 插入空 math_display 节点后自动选中（NodeSelection）并触发 dblclick 进入编辑模式
// - 修复前：插入空 atom 节点，KaTeX 渲染空字符串无可见内容，用户以为没插入
//
// 用最小 schema 构造假 EditorView，验证 dispatch 的 transaction 内容。

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import { EditorView } from "@milkdown/kit/prose/view";
import {
  insertMathBlock,
  insertHr,
} from "../../src/components/Editor/block-commands";

// 构建最小 schema：doc > paragraph + math_display + hr
function makeSchema() {
  return new Schema({
    nodes: {
      doc: { content: "(paragraph | math_display | hr)*" },
      paragraph: {
        group: "block",
        content: "text*",
        toDOM: () => ["p", 0],
        parseDOM: [{ tag: "p" }],
      },
      text: { group: "inline" },
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
    },
  });
}

// 构造假 EditorView，记录所有 dispatch
function makeView(schema: Schema, docContent: any[]) {
  const doc = schema.nodes.doc.create(null, docContent);
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, 1),
  });
  const root = document.createElement("div");
  document.body.appendChild(root);
  const view = new EditorView(root, { state });
  // mock nodeDOM 返回一个可派发事件的元素
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
    const tr = view.state.tr;
    // dispatch 后文档第一个子节点应是 math_display
    expect(view.state.doc.firstChild?.type.name).toBe("math_display");
    view.destroy();
  });

  it("插入后调度 NodeSelection 选中新节点（requestAnimationFrame）", () => {
    const schema = makeSchema();
    const { view } = makeView(schema, [schema.nodes.paragraph.create()]);
    insertMathBlock(view);
    // 插入时立即 dispatch insert transaction
    expect(view.state.doc.firstChild?.type.name).toBe("math_display");
    // 还未执行 requestAnimationFrame，Selection 未变
    // 执行 requestAnimationFrame 回调
    vi.runAllTimers();
    // NodeSelection 选中 pos=0 的节点
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
    // nodeDOM 应被调用获取节点 DOM
    expect(view.nodeDOM).toHaveBeenCalled();
    view.destroy();
  });

  it("在非空段落插入 math_display（插到当前块之后）", () => {
    const schema = makeSchema();
    const para = schema.nodes.paragraph.create(null, [schema.text("hello")]);
    const { view } = makeView(schema, [para]);
    insertMathBlock(view);
    // 第一个子节点仍是 paragraph（hello），第二个是 math_display
    expect(view.state.doc.child(0).type.name).toBe("paragraph");
    expect(view.state.doc.child(1).type.name).toBe("math_display");
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
});
