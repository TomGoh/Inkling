import { describe, it, expect } from "vitest";
import { Schema, Node as PMNode } from "@milkdown/kit/prose/model";
import { formulaNumberingPlugin, formulaNumberingKey } from "../../src/components/Editor/formula-numbering";
import { useSettings } from "../../src/store/settings";
import { EditorState, Transaction } from "@milkdown/kit/prose/state";

describe("Formula Numbering Plugin", () => {
  const schema = new Schema({
    nodes: {
      doc: { content: "block+" },
      paragraph: { group: "block", content: "text*", toDOM: () => ["p", 0] },
      math_display: {
        group: "block",
        atom: true,
        attrs: { value: { default: "" }, number: { default: null } },
        toDOM: () => ["div", { class: "math-display" }],
      },
      text: { inline: true },
    },
  });

  function createDoc(nodes: PMNode[]) {
    return schema.nodes.doc.create({}, nodes);
  }

  function createMathNode(value: string, number: number | null = null) {
    return schema.nodes.math_display.create({ value, number });
  }

  it("should auto-number unnumbered math_display nodes sequentially when enabled", () => {
    useSettings.setState({ formulaAutoNumber: true });

    // 未编号的 math 节点 (number: 999 模拟错误编号)
    const doc = createDoc([
      createMathNode("E=mc^2", 999),
      schema.nodes.paragraph.create({}, schema.text("Middle paragraph")),
      createMathNode("a^2 + b^2 = c^2", 888),
    ]);

    const plugin = formulaNumberingPlugin();
    const state = EditorState.create({
      schema,
      doc,
      plugins: [plugin],
    });

    // 构造一个有文本变更且对 newState 生效的 transaction
    const tr = state.tr.insertText(" extra text", 15);
    expect(tr.docChanged).toBe(true);

    // 验证 collectFixes 针对 state.doc 能检测出不匹配
    const appendTr = plugin.spec.appendTransaction?.([tr], state, state);

    expect(appendTr).not.toBeNull();
    const finalState = state.apply(appendTr as Transaction);

    const mathNodes: PMNode[] = [];
    finalState.doc.descendants((node) => {
      if (node.type.name === "math_display") {
        mathNodes.push(node);
      }
    });

    expect(mathNodes.length).toBe(2);
    expect(mathNodes[0].attrs.number).toBe(1);
    expect(mathNodes[1].attrs.number).toBe(2);
  });

  it("should clear number attributes when formulaAutoNumber is disabled and numbers exist", () => {
    useSettings.setState({ formulaAutoNumber: false });

    const doc = createDoc([
      createMathNode("E=mc^2", 1),
      createMathNode("a^2 + b^2 = c^2", 2),
    ]);

    const plugin = formulaNumberingPlugin();
    const state = EditorState.create({
      schema,
      doc,
      plugins: [plugin],
    });

    // 通过 recalc meta 触发重算
    const tr = state.tr.setMeta(formulaNumberingKey, { recalc: true });
    const appendTr = plugin.spec.appendTransaction?.([tr], state, state);

    expect(appendTr).not.toBeNull();
    const finalState = state.apply(appendTr as Transaction);

    const mathNodes: PMNode[] = [];
    finalState.doc.descendants((node) => {
      if (node.type.name === "math_display") {
        mathNodes.push(node);
      }
    });

    expect(mathNodes.length).toBe(2);
    expect(mathNodes[0].attrs.number).toBeNull();
    expect(mathNodes[1].attrs.number).toBeNull();
  });

  it("should return null if numbers are already up to date", () => {
    useSettings.setState({ formulaAutoNumber: true });

    const doc = createDoc([
      createMathNode("E=mc^2", 1),
      createMathNode("a^2 + b^2 = c^2", 2),
    ]);

    const plugin = formulaNumberingPlugin();
    const state = EditorState.create({
      schema,
      doc,
      plugins: [plugin],
    });

    const tr = state.tr.setMeta(formulaNumberingKey, { recalc: true });
    const appendTr = plugin.spec.appendTransaction?.([tr], state, state.apply(tr));
    expect(appendTr).toBeNull();
  });

  it("should return null if no math_display exists in document", () => {
    useSettings.setState({ formulaAutoNumber: true });
    const doc = createDoc([schema.nodes.paragraph.create({}, schema.text("Hello world"))]);

    const plugin = formulaNumberingPlugin();
    const state = EditorState.create({
      schema,
      doc,
      plugins: [plugin],
    });

    const tr = state.tr.insertText("!", 1);
    const appendTr = plugin.spec.appendTransaction?.([tr], state, state.apply(tr));
    expect(appendTr).toBeNull();
  });
});
