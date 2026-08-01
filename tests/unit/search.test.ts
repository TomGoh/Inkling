// search 插件单元测试
// 重点验证 v1.2.10 修复场景：全部替换（replaceAll）的替换逻辑正确性
// 根因：SearchPanel.doReplaceAll 调用 alert() → Tauri 映射为 dialog.message → ACL 未授权
// 这里测试 replaceAll 本身的纯前端逻辑（不依赖 Tauri），确保替换数量和文档内容正确

import { describe, it, expect } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection, Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { EditorView } from "@milkdown/kit/prose/view";
import {
  searchKey,
  searchPlugin,
  replaceAll,
  replaceCurrent,
  type SearchOpts,
} from "../../src/components/Editor/search";

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

/** 构造带 search 插件的 EditorView，并预设查找选项 */
function makeViewWithSearch(
  text: string,
  opts: SearchOpts,
): EditorView {
  const schema = makeSchema();
  const doc = schema.nodes.paragraph.create(null, schema.text(text));
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, 1),
    plugins: [searchPlugin()],
  });
  const root = document.createElement("div");
  document.body.appendChild(root);
  const view = new EditorView(root, { state });
  // 设置查找选项触发搜索
  view.dispatch(view.state.tr.setMeta(searchKey, { type: "set", opts }));
  return view;
}

describe("replaceAll 全部替换（v1.2.10 修复场景）", () => {
  it("替换所有匹配项并返回正确数量", () => {
    const view = makeViewWithSearch("foo bar foo baz foo", {
      find: "foo",
      replace: "FOO",
      caseSensitive: false,
      useRegex: false,
    });
    const n = replaceAll(view);
    expect(n).toBe(3);
    expect(view.state.doc.textContent).toBe("FOO bar FOO baz FOO");
    view.destroy();
  });

  it("从后往前替换避免位置偏移（多匹配位置正确）", () => {
    const view = makeViewWithSearch("a a a a a", {
      find: "a",
      replace: "bb",
      caseSensitive: false,
      useRegex: false,
    });
    const n = replaceAll(view);
    expect(n).toBe(5);
    // 替换为更长的字符串，验证位置没有错乱
    expect(view.state.doc.textContent).toBe("bb bb bb bb bb");
    view.destroy();
  });

  it("无匹配时返回 0 且文档不变", () => {
    const view = makeViewWithSearch("hello world", {
      find: "xyz",
      replace: "ABC",
      caseSensitive: false,
      useRegex: false,
    });
    const original = view.state.doc.textContent;
    const n = replaceAll(view);
    expect(n).toBe(0);
    expect(view.state.doc.textContent).toBe(original);
    view.destroy();
  });

  it("大小写敏感模式正确替换", () => {
    const view = makeViewWithSearch("Foo foo FOO foo", {
      find: "foo",
      replace: "X",
      caseSensitive: true,
      useRegex: false,
    });
    const n = replaceAll(view);
    expect(n).toBe(2);
    expect(view.state.doc.textContent).toBe("Foo X FOO X");
    view.destroy();
  });

  it("正则模式替换", () => {
    const view = makeViewWithSearch("a1 b2 c3 d4", {
      find: "\\d",
      replace: "0",
      caseSensitive: false,
      useRegex: true,
    });
    const n = replaceAll(view);
    expect(n).toBe(4);
    expect(view.state.doc.textContent).toBe("a0 b0 c0 d0");
    view.destroy();
  });
});

describe("replaceCurrent 替换当前匹配", () => {
  it("仅替换当前选中的匹配项，其余保留", () => {
    const view = makeViewWithSearch("foo foo foo", {
      find: "foo",
      replace: "BAR",
      caseSensitive: false,
      useRegex: false,
    });
    replaceCurrent(view);
    // 默认 current=0，替换第一个
    expect(view.state.doc.textContent).toBe("BAR foo foo");
    view.destroy();
  });
});
