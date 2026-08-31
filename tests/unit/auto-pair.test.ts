// auto-pair 插件单元测试
// 覆盖 #152：选区非空时输入右符号不得触发「跳过」逻辑（吞输入 + 塌缩选区），
// 以及空选区跳过、选区包裹等既有行为不回归。

import { describe, it, expect, beforeEach } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { EditorView } from "@milkdown/kit/prose/view";
import { autoPairPlugin } from "../../src/components/Editor/auto-pair";
import { useSettings } from "../../src/store/settings";

function makeSchema() {
  return new Schema({
    nodes: {
      doc: { content: "block+" },
      paragraph: {
        group: "block",
        content: "text*",
        toDOM: () => ["p", 0],
        parseDOM: [{ tag: "p" }],
      },
      text: { group: "inline" },
    },
  });
}

/** 构造带 autoPair 插件的 view，初始文本为单段落。
 * 注意：paragraph 直接作为顶层节点，文本位置从 0 开始（"(abc)" 中 a=1..2）。
 * sel 指定初始选区，便于断言「处理后选区未变」。 */
function makeView(text: string, sel?: { from: number; to: number }) {
  const plugin = autoPairPlugin();
  const schema = makeSchema();
  const doc = text
    ? schema.nodes.paragraph.create(null, schema.text(text))
    : schema.nodes.paragraph.create();
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, sel?.from ?? 0, sel?.to),
    plugins: [plugin],
  });
  const root = document.createElement("div");
  document.body.appendChild(root);
  const view = new EditorView(root, { state });
  const handleTextInput = plugin.props.handleTextInput as (
    view: EditorView,
    from: number,
    to: number,
    text: string,
  ) => boolean;
  return { view, handleTextInput };
}

beforeEach(() => {
  useSettings.getState().setAutoPair(true);
});

describe("右符号跳过逻辑仅限空选区（#152）", () => {
  it("选区非空时输入右符号不跳过：不 dispatch、选区不变，交还默认替换行为", () => {
    // 文档 "(abc)"：选区 (1,4) 选中 abc，位置 4 后紧跟 ")"
    const { view, handleTextInput } = makeView("(abc)", { from: 1, to: 4 });
    const handled = handleTextInput(view, 1, 4, ")");
    // 修复前返回 true 并把光标移到 5，吞掉输入；修复后交还默认输入处理
    expect(handled).toBe(false);
    expect(view.state.selection.from).toBe(1);
    expect(view.state.selection.to).toBe(4);
    expect(view.state.doc.textContent).toBe("(abc)");
    view.destroy();
  });

  it("选区非空且后续字符不同时同样交还默认行为", () => {
    const { view, handleTextInput } = makeView("(abc)", { from: 1, to: 4 });
    const handled = handleTextInput(view, 1, 4, "]");
    expect(handled).toBe(false);
    expect(view.state.doc.textContent).toBe("(abc)");
    view.destroy();
  });

  it("空选区紧跟相同右符号仍跳过：光标移到符号之后", () => {
    // 光标在 ")" 之前（位置 4），输入 ")" 应跳过到 5
    const { view, handleTextInput } = makeView("(abc)", { from: 4, to: 4 });
    const handled = handleTextInput(view, 4, 4, ")");
    expect(handled).toBe(true);
    expect(view.state.selection.from).toBe(5);
    expect(view.state.doc.textContent).toBe("(abc)");
    view.destroy();
  });
});

describe("既有配对行为不回归", () => {
  it("选区非空输入配对符号仍包裹选中文本", () => {
    const { view, handleTextInput } = makeView("(abc)", { from: 1, to: 4 });
    const handled = handleTextInput(view, 1, 4, '"');
    expect(handled).toBe(true);
    expect(view.state.doc.textContent).toBe('("abc")');
    // 选区收缩到包裹内容内部（"abc"）
    expect(view.state.selection.from).toBe(2);
    expect(view.state.selection.to).toBe(5);
    view.destroy();
  });

  it("空选区输入左符号自动补全右符号，光标居中", () => {
    const { view, handleTextInput } = makeView("");
    const handled = handleTextInput(view, 0, 0, "(");
    expect(handled).toBe(true);
    expect(view.state.doc.textContent).toBe("()");
    expect(view.state.selection.from).toBe(1);
    view.destroy();
  });

  it("autoPair 关闭时不拦截任何输入", () => {
    useSettings.getState().setAutoPair(false);
    const { view, handleTextInput } = makeView("(abc)", { from: 4, to: 4 });
    expect(handleTextInput(view, 4, 4, ")")).toBe(false);
    expect(handleTextInput(view, 0, 0, "(")).toBe(false);
    view.destroy();
  });
});
