import { describe, it, expect } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { EditorView } from "@milkdown/kit/prose/view";
import {
  matchCommand,
  buildCommands,
  detectSlash,
  deriveState,
  SlashCommand,
} from "../../src/components/Editor/slash-menu";

function makeTestSchema() {
  return new Schema({
    nodes: {
      doc: { content: "block+" },
      paragraph: {
        group: "block",
        content: "inline*",
        toDOM: () => ["p", 0],
      },
      heading: {
        group: "block",
        content: "inline*",
        attrs: { level: { default: 1 } },
        toDOM: (node) => [`h${node.attrs.level}`, 0],
      },
      code_block: {
        group: "block",
        content: "text*",
        toDOM: () => ["pre", ["code", 0]],
      },
      text: { group: "inline" },
    },
  });
}

describe("Issue #95: Slash menu query range, filtering, and execution", () => {
  it("should match command by label and keywords", () => {
    const cmd: SlashCommand = {
      label: "标题 1",
      keywords: "heading h1 标题",
      icon: "H",
      run: () => {},
    };

    expect(matchCommand(cmd, "")).toBe(true);
    expect(matchCommand(cmd, "h1")).toBe(true);
    expect(matchCommand(cmd, "heading")).toBe(true);
    expect(matchCommand(cmd, "标题")).toBe(true);
    expect(matchCommand(cmd, "nomatch")).toBe(false);
  });

  it("should detect slash trigger only at start of line / paragraph", () => {
    const schema = makeTestSchema();

    // 1. 在段落起始处输 "/h1" -> 触发
    const doc1 = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [schema.text("/h1")]),
    ]);
    const state1 = EditorState.create({
      doc: doc1,
      selection: TextSelection.create(doc1, 4), // "/h1" 后面
    });
    const root1 = document.createElement("div");
    const view1 = new EditorView(root1, { state: state1 });
    const detected1 = detectSlash(view1);
    expect(detected1).not.toBeNull();
    expect(detected1?.query).toBe("h1");
    expect(detected1?.anchorPos).toBe(0);

    // 2. 在文本中间输 "Hello /h1" -> 不触发（必须在段落起始 ^/）
    const doc2 = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [schema.text("Hello /h1")]),
    ]);
    const state2 = EditorState.create({
      doc: doc2,
      selection: TextSelection.create(doc2, 10),
    });
    const root2 = document.createElement("div");
    const view2 = new EditorView(root2, { state: state2 });
    const detected2 = detectSlash(view2);
    expect(detected2).toBeNull();

    // 3. 在 code_block 节点中输 "/h1" -> 不触发
    const doc3 = schema.nodes.doc.create(null, [
      schema.nodes.code_block.create(null, [schema.text("/h1")]),
    ]);
    const state3 = EditorState.create({
      doc: doc3,
      selection: TextSelection.create(doc3, 4),
    });
    const root3 = document.createElement("div");
    const view3 = new EditorView(root3, { state: state3 });
    const detected3 = detectSlash(view3);
    expect(detected3).toBeNull();
  });

  it("should execute slash command and cleanly replace slash query range", () => {
    const schema = makeTestSchema();
    // 文本："/h1"
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.text("/h1"),
      ]),
    ]);

    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 4), // 光标在 "/h1" 末尾 (pos 4)
    });

    const root = document.createElement("div");
    const view = new EditorView(root, { state });

    const detected = detectSlash(view);
    expect(detected).not.toBeNull();

    const commands = buildCommands(view);
    const h1Cmd = commands.find((c) => c.label === "标题 1");
    expect(h1Cmd).toBeDefined();

    // 执行 run(view, detected.anchorPos)
    h1Cmd!.run(view, detected!.anchorPos);

    // 检查执行后的文档：段落节点变为 heading，且 "/h1" 已被清除
    const newDoc = view.state.doc;
    expect(newDoc.firstChild?.type.name).toBe("heading");
    expect(newDoc.firstChild?.attrs.level).toBe(1);
    expect(newDoc.firstChild?.textContent).toBe("");
  });

  it("should support state derivation and Esc reset without modifying document", () => {
    const schema = makeTestSchema();
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.text("/test"),
      ]),
    ]);

    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 6),
    });

    const root = document.createElement("div");
    const view = new EditorView(root, { state });

    const slashState = deriveState(view, {
      active: false,
      anchorPos: 0,
      query: "",
      selectedIndex: 0,
    });
    expect(slashState.active).toBe(true);
    expect(slashState.query).toBe("test");
    expect(slashState.anchorPos).toBe(0);

    // 光标移动到非 slash 位置推导状态自动变为 active: false
    const stateMoved = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1),
    });
    const viewMoved = new EditorView(root, { state: stateMoved });
    const resetState = deriveState(viewMoved, slashState);
    expect(resetState.active).toBe(false);
  });
});
