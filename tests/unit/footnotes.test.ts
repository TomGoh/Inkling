import { describe, it, expect, vi } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import {
  findFootnoteDefPos,
  findFirstFootnoteRefPos,
  createFootnoteRefView,
  createFootnoteDefView,
} from "../../src/components/Editor/footnotes";

describe("Footnotes Plugin & Views", () => {
  const schema = new Schema({
    nodes: {
      doc: { content: "block+" },
      paragraph: { content: "inline*", group: "block" },
      text: { group: "inline" },
      footnote_reference: {
        inline: true,
        group: "inline",
        attrs: { label: { default: "1" } },
        parseDOM: [{ tag: "sup.footnote-ref" }],
        toDOM: (node) => ["sup", { class: "footnote-ref" }, `[${node.attrs.label}]`],
      },
      footnote_definition: {
        group: "block",
        content: "inline*",
        attrs: { label: { default: "1" } },
        parseDOM: [{ tag: "div.footnote-definition" }],
        toDOM: (node) => ["div", { class: "footnote-definition" }, 0],
      },
    },
  });

  it("should find footnote_definition position correctly", () => {
    const doc = schema.nodes.doc.create({}, [
      schema.nodes.paragraph.create({}, [schema.text("Hello world")]),
      schema.nodes.footnote_definition.create({ label: "fn1" }, [schema.text("Footnote 1 content")]),
      schema.nodes.footnote_definition.create({ label: "fn2" }, [schema.text("Footnote 2 content")]),
    ]);

    const pos1 = findFootnoteDefPos(doc, "fn1");
    const pos2 = findFootnoteDefPos(doc, "fn2");
    const posNotFound = findFootnoteDefPos(doc, "fn3");

    expect(pos1).not.toBeNull();
    expect(pos2).not.toBeNull();
    expect(posNotFound).toBeNull();
    expect(pos2).toBeGreaterThan(pos1!);
  });

  it("should find first footnote_reference position correctly", () => {
    const doc = schema.nodes.doc.create({}, [
      schema.nodes.paragraph.create({}, [
        schema.text("Paragraph 1 with ref "),
        schema.nodes.footnote_reference.create({ label: "fn1" }),
      ]),
      schema.nodes.paragraph.create({}, [
        schema.text("Paragraph 2 with another ref "),
        schema.nodes.footnote_reference.create({ label: "fn1" }),
        schema.nodes.footnote_reference.create({ label: "fn2" }),
      ]),
    ]);

    const posFirstFn1 = findFirstFootnoteRefPos(doc, "fn1");
    const posFn2 = findFirstFootnoteRefPos(doc, "fn2");
    const posFn3 = findFirstFootnoteRefPos(doc, "fn3");

    expect(posFirstFn1).not.toBeNull();
    expect(posFn2).not.toBeNull();
    expect(posFn3).toBeNull();
    expect(posFn2).toBeGreaterThan(posFirstFn1!);
  });

  it("should create footnote ref view with correct elements and click handler", () => {
    const refViewFactory = createFootnoteRefView();
    const node = schema.nodes.footnote_reference.create({ label: "note1" });

    const scrollIntoViewMock = vi.fn();
    const targetElement = document.createElement("div");
    targetElement.scrollIntoView = scrollIntoViewMock;

    const mockDoc = schema.nodes.doc.create({}, [
      schema.nodes.footnote_definition.create({ label: "note1" }, [schema.text("content")]),
    ]);

    const mockView = {
      state: { doc: mockDoc },
      nodeDOM: vi.fn().mockReturnValue(targetElement),
    } as any;

    const nodeView = refViewFactory(node, mockView, () => 0);
    expect(nodeView.dom).toBeDefined();

    const sup = nodeView.dom as HTMLElement;
    expect(sup.tagName.toLowerCase()).toBe("sup");
    expect(sup.className).toBe("footnote-ref");
    expect(sup.getAttribute("data-label")).toBe("note1");

    const link = sup.querySelector("a");
    expect(link).not.toBeNull();
    expect(link?.textContent).toBe("note1");

    // 点击事件触发跳转
    link?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(mockView.nodeDOM).toHaveBeenCalled();
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });

    // 更新逻辑
    expect(nodeView.update?.(schema.nodes.footnote_reference.create({ label: "note1" }))).toBe(true);
    expect(nodeView.update?.(schema.nodes.footnote_reference.create({ label: "note2" }))).toBe(false);
    expect(nodeView.update?.(schema.nodes.paragraph.create())).toBe(false);
  });

  it("should create footnote def view with correct elements and backlink handler", () => {
    const defViewFactory = createFootnoteDefView();
    const node = schema.nodes.footnote_definition.create({ label: "note1" });

    const scrollIntoViewMock = vi.fn();
    const targetElement = document.createElement("sup");
    targetElement.scrollIntoView = scrollIntoViewMock;

    const mockDoc = schema.nodes.doc.create({}, [
      schema.nodes.paragraph.create({}, [schema.nodes.footnote_reference.create({ label: "note1" })]),
      node,
    ]);

    const mockView = {
      state: { doc: mockDoc },
      nodeDOM: vi.fn().mockReturnValue(targetElement),
    } as any;

    const nodeView = defViewFactory(node, mockView, () => 0);
    expect(nodeView.dom).toBeDefined();
    expect(nodeView.contentDOM).toBeDefined();

    const dom = nodeView.dom as HTMLElement;
    expect(dom.className).toBe("footnote-definition");
    expect(dom.getAttribute("data-label")).toBe("note1");

    const labelSpan = dom.querySelector(".footnote-label");
    expect(labelSpan?.textContent).toBe("note1");

    const backlink = dom.querySelector(".footnote-backref") as HTMLElement;
    expect(backlink).not.toBeNull();

    // 点击返回链接
    backlink.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(mockView.nodeDOM).toHaveBeenCalled();
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });

    // 更新逻辑
    expect(nodeView.update?.(schema.nodes.footnote_definition.create({ label: "note1" }))).toBe(true);
    expect(nodeView.update?.(schema.nodes.footnote_definition.create({ label: "note2" }))).toBe(false);
  });
});
