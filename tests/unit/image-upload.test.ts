// 图片拖拽/粘贴上传插件测试（v2.3.8 修复 #60）
// 验证：未命名草稿（untitled-N 虚拟路径）粘贴图片不落盘，以 Data URL 内联插入；
// 普通文档粘贴图片写入 assets/ 并插入相对路径。

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { EditorView } from "@milkdown/kit/prose/view";

const { resolvePathFromDocumentMock, writeBinaryFileMock } = vi.hoisted(() => ({
  resolvePathFromDocumentMock: vi.fn(),
  writeBinaryFileMock: vi.fn(),
}));

vi.mock("../../src/lib/fs", () => ({
  resolvePathFromDocument: resolvePathFromDocumentMock,
  writeBinaryFile: writeBinaryFileMock,
}));

import { imageUploadPlugin } from "../../src/components/Editor/image-upload";

function makeSchema() {
  return new Schema({
    nodes: {
      doc: { content: "paragraph+" },
      paragraph: {
        content: "(text | image)*",
        toDOM: () => ["p", 0],
        parseDOM: [{ tag: "p" }],
      },
      text: { group: "inline" },
      image: {
        group: "inline",
        inline: true,
        atom: true,
        attrs: { src: { default: "" }, alt: { default: null } },
        toDOM: (node: any) => ["img", { src: node.attrs.src }],
        parseDOM: [{ tag: "img" }],
      },
    },
  });
}

function makeView() {
  const schema = makeSchema();
  const doc = schema.nodes.doc.create(null, [
    schema.nodes.paragraph.create(null, [schema.text("光标在这")]),
  ]);
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, 1),
  });
  const root = document.createElement("div");
  document.body.appendChild(root);
  return new EditorView(root, { state });
}

function makePasteEvent(file: File) {
  return {
    clipboardData: { files: [file] },
    preventDefault: vi.fn(),
  } as unknown as ClipboardEvent;
}

async function flushAsync() {
  // FileReader / await 链需要多轮微任务+宏任务冲刷
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 0));
  }
}

describe("imageUploadPlugin 粘贴图片", () => {
  let view: EditorView;

  beforeEach(() => {
    view = makeView();
    resolvePathFromDocumentMock.mockReset();
    writeBinaryFileMock.mockReset();
    resolvePathFromDocumentMock.mockResolvedValue("/docs/assets/x.png");
    writeBinaryFileMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    view.destroy();
  });

  it("普通文档：写入 assets/ 并插入相对路径图片", async () => {
    const plugin = imageUploadPlugin("/docs/note.md");
    const file = new File([new Uint8Array([1, 2, 3])], "shot.png", {
      type: "image/png",
    });
    const handled = (plugin.props.handlePaste as any)(view, makePasteEvent(file));
    expect(handled).toBe(true);
    await flushAsync();

    expect(writeBinaryFileMock).toHaveBeenCalledTimes(1);
    const inserted = view.state.doc.firstChild?.content.firstChild;
    expect(inserted?.type.name).toBe("image");
    expect(inserted?.attrs.src).toMatch(/^assets\/.+\.png$/);
  });

  it("未命名草稿（untitled-N）：不落盘，插入 data URL", async () => {
    const plugin = imageUploadPlugin("untitled-1");
    const file = new File([new Uint8Array([1, 2, 3])], "shot.png", {
      type: "image/png",
    });
    const handled = (plugin.props.handlePaste as any)(view, makePasteEvent(file));
    expect(handled).toBe(true);
    await flushAsync();

    // 虚拟路径不得进入目录解析/磁盘写入（此前会按 CWD 解析出错误路径导致 IO 报错）
    expect(resolvePathFromDocumentMock).not.toHaveBeenCalled();
    expect(writeBinaryFileMock).not.toHaveBeenCalled();
    const inserted = view.state.doc.firstChild?.content.firstChild;
    expect(inserted?.type.name).toBe("image");
    expect(inserted?.attrs.src).toMatch(/^data:image\/png;base64,/);
  });

  it("空路径同样走 Data URL 兜底", async () => {
    const plugin = imageUploadPlugin("");
    const file = new File([new Uint8Array([9])], "pic.jpg", {
      type: "image/jpeg",
    });
    (plugin.props.handlePaste as any)(view, makePasteEvent(file));
    await flushAsync();

    expect(writeBinaryFileMock).not.toHaveBeenCalled();
    const inserted = view.state.doc.firstChild?.content.firstChild;
    expect(inserted?.attrs.src).toMatch(/^data:image\/jpeg;base64,/);
  });
});
