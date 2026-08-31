// 查找替换插件
// 在 ProseMirror 文档中搜索匹配文本，用 Decoration 高亮，支持正则/大小写。
// 当前匹配用不同 class 标记，替换/全部替换通过 transaction 直接改文档。
// UI（SearchPanel）通过 setMeta 触发查找与导航，并通过 getState 读取结果计数。

import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { Node } from "@milkdown/kit/prose/model";

export interface SearchOpts {
  find: string;
  caseSensitive: boolean;
  useRegex: boolean;
}

interface SearchState {
  opts: SearchOpts | null;
  matches: { from: number; to: number }[];
  current: number;
}

export const searchKey = new PluginKey<SearchState>("inkling-search");

type SearchMeta =
  | { type: "set"; opts: SearchOpts }
  | { type: "next" }
  | { type: "prev" }
  | { type: "clear" };

/** 根据选项构建正则，非法时返回 null */
function buildRegex(opts: SearchOpts): RegExp | null {
  if (!opts.find) return null;
  try {
    let pattern = opts.find;
    if (!opts.useRegex) {
      pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    const flags = opts.caseSensitive ? "g" : "gi";
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

/** 遍历文档文本节点，收集所有匹配区间 */
function computeMatches(doc: Node, regex: RegExp): { from: number; to: number }[] {
  const matches: { from: number; to: number }[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const text = node.text ?? "";
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      if (m[0].length === 0) {
        regex.lastIndex++;
        continue;
      }
      matches.push({ from: pos + m.index, to: pos + m.index + m[0].length });
    }
    return false;
  });
  return matches;
}

export const searchPlugin = () => {
  // 按 (matches, current, doc) 引用缓存 DecorationSet：搜索状态未变的无关
  // transaction（普通输入等）直接复用，避免每次按键全量重建装饰（#151）
  let decoCache: {
    matches: SearchState["matches"];
    current: number;
    doc: Node;
    set: DecorationSet;
  } | null = null;
  return new Plugin<SearchState>({
    key: searchKey,
    state: {
      init: () => ({ opts: null, matches: [], current: -1 }),
      apply: (tr, value, _oldState, newState) => {
        const meta = tr.getMeta(searchKey) as SearchMeta | undefined;
        if (meta?.type === "clear") {
          return { opts: null, matches: [], current: -1 };
        }
        if (meta?.type === "set") {
          const regex = buildRegex(meta.opts);
          const matches = regex ? computeMatches(newState.doc, regex) : [];
          return { opts: meta.opts, matches, current: matches.length > 0 ? 0 : -1 };
        }
        if (meta?.type === "next") {
          const n = value.matches.length;
          if (n === 0) return value;
          return { ...value, current: (value.current + 1) % n };
        }
        if (meta?.type === "prev") {
          const n = value.matches.length;
          if (n === 0) return value;
          return { ...value, current: (value.current - 1 + n) % n };
        }
        // 文档变化时重新计算匹配（保持查找结果与编辑同步）
        if (tr.docChanged && value.opts) {
          const regex = buildRegex(value.opts);
          const matches = regex ? computeMatches(newState.doc, regex) : [];
          let current = value.current;
          if (current >= matches.length) current = matches.length > 0 ? 0 : -1;
          return { ...value, matches, current };
        }
        return value;
      },
    },
    props: {
      decorations: (state) => {
        const s = searchKey.getState(state);
        if (!s || s.matches.length === 0) return DecorationSet.empty;
        if (
          decoCache &&
          decoCache.matches === s.matches &&
          decoCache.current === s.current &&
          decoCache.doc === state.doc
        ) {
          return decoCache.set;
        }
        const decos = s.matches.map((m, i) =>
          Decoration.inline(m.from, m.to, {
            class: i === s.current ? "search-match-current" : "search-match",
          }),
        );
        const set = DecorationSet.create(state.doc, decos);
        decoCache = { matches: s.matches, current: s.current, doc: state.doc, set };
        return set;
      },
    },
  });
};

/** 滚动到当前匹配位置 */
export function scrollToCurrent(view: EditorView): void {
  const s = searchKey.getState(view.state);
  if (!s || s.current < 0) return;
  const m = s.matches[s.current];
  if (!m) return;
  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.near(view.state.doc.resolve(m.from)))
      .scrollIntoView(),
  );
}

/** 替换当前匹配；替换串为空表示删除匹配文本 */
export function replaceCurrent(view: EditorView, replacement: string): void {
  const s = searchKey.getState(view.state);
  if (!s || !s.opts || s.current < 0) return;
  const m = s.matches[s.current];
  if (!m) return;
  const tr = view.state.tr;
  // ProseMirror 禁止空文本节点，空串替换必须走 delete（#178）
  if (replacement === "") {
    tr.delete(m.from, m.to);
  } else {
    tr.replaceWith(m.from, m.to, view.state.schema.text(replacement));
  }
  view.dispatch(tr);
}

/** 替换全部匹配（从后往前，避免位置偏移）；替换串为空表示删除全部匹配文本 */
export function replaceAll(view: EditorView, replacement: string): number {
  const s = searchKey.getState(view.state);
  if (!s || !s.opts) return 0;
  const tr = view.state.tr;
  const sorted = [...s.matches].sort((a, b) => b.from - a.from);
  for (const m of sorted) {
    if (replacement === "") {
      tr.delete(m.from, m.to);
    } else {
      tr.replaceWith(m.from, m.to, view.state.schema.text(replacement));
    }
  }
  view.dispatch(tr);
  return sorted.length;
}
