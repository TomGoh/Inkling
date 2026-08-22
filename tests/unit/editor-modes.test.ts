// 专注模式装饰粒度单测（issue #56）
//
// 背景：专注模式的高亮装饰由 editor-modes.ts 的 decorations 挂到「当前块」上，
// App.css 只对 `.ProseMirror > .inkling-focused`（文档直接子节点）高亮。
// v2.3.4 前装饰取最内层块 findParentNodeClosestToPos(n => n.isBlock)：
// 段落/标题本身是直接子节点所以正常；列表/表格只会命中内部段落，
// 而外层列表/表格仍被 `.ProseMirror > *` 整体弱化到 0.35，点不亮。
//
// 修复：改取光标所在「文档顶层块」（$head.node(1)，即 .ProseMirror 直接子节点），
// 使装饰粒度与 CSS 高亮粒度一致。本测试断言装饰落在 top-level 块上：
// 列表 → bullet_list/ordered_list，表格 → table，段落 → paragraph。

import { afterAll, beforeAll, describe, expect, it, beforeEach } from "vitest";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import {
  Editor,
  defaultValueCtx,
  rootCtx,
  parserCtx,
} from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { editorModesPlugin } from "../../src/components/Editor/editor-modes";
import { useSettings } from "../../src/store/settings";

let parse: (markdown: string) => PMNode;
let teardown: () => Promise<unknown>;

// 提取插件 props.decorations(state) —— 与 Milkdown 在渲染时调用的一致
function decorationsOf(state: EditorState) {
  const plugin = editorModesPlugin();
  const fn = plugin.spec.props.decorations as (s: EditorState) => unknown;
  return fn(state);
}

/** 深度优先找第一个指定类型节点的起始位置；找不到返回 -1 */
function findNodeStart(doc: PMNode, type: string): number {
  let pos = -1;
  doc.descendants((n, p) => {
    if (pos >= 0) return false;
    if (n.type.name === type) {
      pos = p;
      return false;
    }
    return true;
  });
  return pos;
}

/** 解析 markdown 并用光标 head 落在指定 top-level 块内建一个 state */
function stateWithCursorIn(markdown: string, topType: string) {
  const doc = parse(markdown);
  const top = findNodeStart(doc, topType);
  // 命中 top-level 块内部（start+1 一定落在块内而非块边界）
  const anchor = top + 1;
  return EditorState.create({ doc, selection: TextSelection.create(doc, anchor) });
}

describe("专注模式装饰粒度（issue #56）", () => {
  beforeAll(async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const editor = await Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, host);
        ctx.set(defaultValueCtx, "");
      })
      .use(commonmark)
      .use(gfm)
      .create();
    parse = editor.action((ctx) => ctx.get(parserCtx));
    teardown = () => editor.destroy();
  }, 30_000);

  afterAll(async () => {
    await teardown();
  });

  beforeEach(() => {
    useSettings.setState({ focusMode: true });
  });

  it("光标在段落内：装饰落在 paragraph（直接子节点）", () => {
    const state = stateWithCursorIn("一段正文。", "paragraph");
    const set = decorationsOf(state) as { find: () => Array<{ from: number; to: number }> };
    const decos = set.find();
    expect(decos).toHaveLength(1);
    const node = state.doc.nodeAt(decos[0].from);
    expect(node, "装饰应落在段落块上").toBeTruthy();
    expect(node!.type.name).toBe("paragraph");
  });

  it("光标在无序列表内：装饰落在 bullet_list 而非内部段落", () => {
    const state = stateWithCursorIn(
      "- 甲\n- 乙\n\n后续段落。\n",
      "bullet_list",
    );
    const set = decorationsOf(state) as { find: () => Array<{ from: number; to: number }> };
    const decos = set.find();
    expect(decos).toHaveLength(1);
    const node = state.doc.nodeAt(decos[0].from);
    expect(node, "装饰应落在顶层列表块上").toBeTruthy();
    expect(node!.type.name).toBe("bullet_list");
  });

  it("光标在有序列表内：装饰落在 ordered_list 而非内部段落", () => {
    const state = stateWithCursorIn(
      "1. 第一\n2. 第二\n",
      "ordered_list",
    );
    const set = decorationsOf(state) as { find: () => Array<{ from: number; to: number }> };
    const decos = set.find();
    expect(decos).toHaveLength(1);
    const node = state.doc.nodeAt(decos[0].from);
    expect(node).toBeTruthy();
    expect(node!.type.name).toBe("ordered_list");
  });

  it("光标在表格单元格内：装饰落在 table 而非内部段落", () => {
    const state = stateWithCursorIn(
      "| 列A | 列B |\n| --- | --- |\n| a1 | b1 |\n",
      "table",
    );
    const set = decorationsOf(state) as { find: () => Array<{ from: number; to: number }> };
    const decos = set.find();
    expect(decos).toHaveLength(1);
    const node = state.doc.nodeAt(decos[0].from);
    expect(node, "装饰应落在顶层表格块上").toBeTruthy();
    expect(node!.type.name).toBe("table");
  });

  it("关闭专注模式：不产生任何高亮装饰", () => {
    useSettings.setState({ focusMode: false });
    const state = stateWithCursorIn("一段正文。", "paragraph");
    const set = decorationsOf(state) as { find: () => Array<{ from: number; to: number }> };
    expect(set.find()).toHaveLength(0);
  });
});