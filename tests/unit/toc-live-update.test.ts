import { afterEach, describe, expect, it, vi } from "vitest";
import { Node as ProseMirrorNode, Schema } from "@milkdown/kit/prose/model";
import { EditorState } from "@milkdown/kit/prose/state";
import { EditorView } from "@milkdown/kit/prose/view";
import { createTocView, tocPlugin } from "../../src/components/Editor/toc";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    text: { group: "inline" },
    paragraph: {
      group: "block",
      content: "inline*",
      toDOM: () => ["p", 0],
    },
    heading: {
      attrs: { level: { default: 1 } },
      group: "block",
      content: "inline*",
      toDOM: (node) => [`h${node.attrs.level}`, 0],
    },
    toc: {
      group: "block",
      atom: true,
      toDOM: () => ["div", { "data-toc": "" }],
    },
  },
});

const views: EditorView[] = [];

afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function heading(text: string, level = 1) {
  return schema.nodes.heading.create({ level }, schema.text(text));
}

describe("TOC live updates", () => {
  it("refreshes the TOC when a heading outside the TOC node changes", () => {
    vi.useFakeTimers();
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const doc = schema.nodes.doc.create(null, [schema.nodes.toc.create(), heading("Old title")]);
    const view = new EditorView(mount, {
      state: EditorState.create({ doc, plugins: [tocPlugin()] }),
      nodeViews: { toc: createTocView() },
    });
    views.push(view);

    expect(mount.querySelector(".toc-item a")?.textContent).toBe("Old title");

    // toc 的 nodeSize 为 1，标题内容位于 2..11；只替换标题文本，TOC 节点本身不变。
    view.dispatch(view.state.tr.insertText("New title", 2, 11));
    vi.advanceTimersByTime(150);

    expect(mount.querySelector(".toc-item a")?.textContent).toBe("New title");

    view.dispatch(view.state.tr.insert(view.state.doc.content.size, heading("Second", 2)));
    vi.advanceTimersByTime(150);
    expect(Array.from(mount.querySelectorAll(".toc-item a"), (item) => item.textContent)).toEqual([
      "New title",
      "Second",
    ]);

    const secondHeadingStart = view.state.doc.child(0).nodeSize + view.state.doc.child(1).nodeSize;
    view.dispatch(view.state.tr.delete(secondHeadingStart, view.state.doc.content.size));
    vi.advanceTimersByTime(150);
    expect(Array.from(mount.querySelectorAll(".toc-item a"), (item) => item.textContent)).toEqual([
      "New title",
    ]);
  });

  it("updates every TOC in the editor without rebuilding for paragraph-only edits", () => {
    vi.useFakeTimers();
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const doc = schema.nodes.doc.create(null, [
      schema.nodes.toc.create(),
      heading("Title"),
      schema.nodes.toc.create(),
      schema.nodes.paragraph.create(null, schema.text("Body")),
    ]);
    const view = new EditorView(mount, {
      state: EditorState.create({ doc, plugins: [tocPlugin()] }),
      nodeViews: { toc: createTocView() },
    });
    views.push(view);

    const originalLinks = Array.from(mount.querySelectorAll(".toc-item a"));
    expect(originalLinks).toHaveLength(2);

    const paragraphStart = view.state.doc.child(0).nodeSize
      + view.state.doc.child(1).nodeSize
      + view.state.doc.child(2).nodeSize
      + 1;
    view.dispatch(view.state.tr.insertText(" changed", paragraphStart + 4));
    vi.advanceTimersByTime(150);
    const linksAfterParagraphEdit = Array.from(mount.querySelectorAll(".toc-item a"));
    expect(linksAfterParagraphEdit).toHaveLength(originalLinks.length);
    linksAfterParagraphEdit.forEach((link, index) => {
      expect(link).toBe(originalLinks[index]);
    });

    view.dispatch(view.state.tr.insertText("Updated ", 2));
    vi.advanceTimersByTime(150);
    expect(Array.from(mount.querySelectorAll(".toc-item a"), (item) => item.textContent)).toEqual([
      "Updated Title",
      "Updated Title",
    ]);
  });

  it("does not scan headings when the editor has no TOC", () => {
    vi.useFakeTimers();
    const descendants = vi.spyOn(ProseMirrorNode.prototype, "descendants");
    const mount = document.createElement("div");
    document.body.appendChild(mount);

    const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, schema.text("Body"))]);
    const view = new EditorView(mount, {
      state: EditorState.create({ doc, plugins: [tocPlugin()] }),
    });
    views.push(view);
    descendants.mockClear();

    view.dispatch(view.state.tr.insertText(" more", 5));
    vi.advanceTimersByTime(500);

    expect(descendants).not.toHaveBeenCalled();
  });
});
