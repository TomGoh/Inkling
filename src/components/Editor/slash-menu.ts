// 斜杠菜单（Slash Menu）
// 在空行或行首输入 `/` 弹出块类型选择菜单，键盘上下导航，回车插入。
// 后续输入的文字作为过滤词模糊匹配命令名。
// 仅在普通段落（非代码块/非frontmatter）内触发。
// 浮层用纯 DOM 渲染，避免 React portal 跨层依赖。
// 状态从文档/选区直接推导（active/query/anchorPos），selectedIndex 单独维护。

import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

/** 插件状态 */
interface SlashState {
  active: boolean;
  /** `/` 字符所在位置 */
  anchorPos: number;
  /** `/` 之后的过滤词 */
  query: string;
  /** 当前选中的命令索引（相对于过滤后的列表） */
  selectedIndex: number;
}

/** 命令定义 */
interface SlashCommand {
  label: string;
  keywords: string;
  icon: string;
  run: (view: EditorView, anchorPos: number) => void;
}

export const slashKey = new PluginKey<SlashState>("inkling-slash-menu");

const initialState: SlashState = {
  active: false,
  anchorPos: -1,
  query: "",
  selectedIndex: 0,
};

/** 判断光标是否在不应触发的节点内 */
function isInForbiddenNode(view: EditorView): boolean {
  const { $head } = view.state.selection;
  for (let d = $head.depth; d > 0; d--) {
    const name = $head.node(d).type.name;
    if (
      name === "code_block" ||
      name === "frontmatter" ||
      name === "math_display" ||
      name === "math_inline" ||
      name === "toc" ||
      name === "callout"
    ) {
      return true;
    }
  }
  return false;
}

/** 计算光标前是否符合斜杠触发条件 */
function detectSlash(view: EditorView): { anchorPos: number; query: string } | null {
  const { selection } = view.state;
  if (!selection.empty) return null;
  if (isInForbiddenNode(view)) return null;
  const $head = selection.$head;
  if ($head.parent.type.name !== "paragraph") return null;
  const textBefore = $head.parent.textContent.slice(0, $head.parentOffset);
  const m = /^\/(\S*)$/.exec(textBefore);
  if (!m) return null;
  return { anchorPos: $head.start() - 1, query: m[1] };
}

/** 从文档推导状态（不依赖 selectedIndex） */
function deriveState(view: EditorView, prev: SlashState): SlashState {
  const detected = detectSlash(view);
  if (!detected) {
    return { ...initialState };
  }
  // query 变化时重置选中索引
  const selectedIndex = detected.query === prev.query ? prev.selectedIndex : 0;
  return {
    active: true,
    anchorPos: detected.anchorPos,
    query: detected.query,
    selectedIndex,
  };
}

function matchCommand(cmd: SlashCommand, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    cmd.label.toLowerCase().includes(q) ||
    cmd.keywords.toLowerCase().includes(q)
  );
}

/** 创建命令列表 */
function buildCommands(view: EditorView): SlashCommand[] {
  const schema = view.state.schema;
  const cmds: SlashCommand[] = [];

  // 标题 1-3
  for (let level = 1; level <= 3; level++) {
    const lv = level;
    cmds.push({
      label: `标题 ${lv}`,
      keywords: `heading h${lv} 标题`,
      icon: "H",
      run: (v, anchor) => {
        const headingType = schema.nodes.heading;
        if (!headingType) return;
        const sel = v.state.selection;
        const tr = v.state.tr.deleteRange(anchor, sel.from);
        // anchor 即段落节点位置（$head.start()-1），直接用它；
        // 不能用 $pos.before()，文档第一个节点时会抛 "there is no position before the top-level node"
        tr.setNodeMarkup(anchor, headingType, { level: lv });
        v.dispatch(tr);
        v.focus();
      },
    });
  }

  // 无序列表
  if (schema.nodes.bullet_list) {
    cmds.push({
      label: "无序列表",
      keywords: "bullet list ul 无序列表 列表",
      icon: "•",
      run: (v, anchor) => {
        v.dispatch(v.state.tr.deleteRange(anchor, v.state.selection.from));
        const wrap = v.state.tr;
        const range = wrap.selection.$from.blockRange(wrap.selection.$to);
        if (range) {
          wrap.wrap(range, [{ type: schema.nodes.bullet_list }]);
          v.dispatch(wrap);
        }
        v.focus();
      },
    });
  }

  // 有序列表
  if (schema.nodes.ordered_list) {
    cmds.push({
      label: "有序列表",
      keywords: "ordered list ol 有序列表 编号",
      icon: "1.",
      run: (v, anchor) => {
        v.dispatch(v.state.tr.deleteRange(anchor, v.state.selection.from));
        const wrap = v.state.tr;
        const range = wrap.selection.$from.blockRange(wrap.selection.$to);
        if (range) {
          wrap.wrap(range, [{ type: schema.nodes.ordered_list }]);
          v.dispatch(wrap);
        }
        v.focus();
      },
    });
  }

  // 引用块
  if (schema.nodes.blockquote) {
    cmds.push({
      label: "引用块",
      keywords: "quote blockquote 引用",
      icon: "❝",
      run: (v, anchor) => {
        v.dispatch(v.state.tr.deleteRange(anchor, v.state.selection.from));
        const wrap = v.state.tr;
        const range = wrap.selection.$from.blockRange(wrap.selection.$to);
        if (range) {
          wrap.wrap(range, [{ type: schema.nodes.blockquote }]);
          v.dispatch(wrap);
        }
        v.focus();
      },
    });
  }

  // 代码块
  if (schema.nodes.code_block) {
    cmds.push({
      label: "代码块",
      keywords: "code codeblock 代码",
      icon: "</>",
      run: (v, anchor) => {
        const tr = v.state.tr.deleteRange(anchor, v.state.selection.from);
        tr.setNodeMarkup(anchor, schema.nodes.code_block, { language: "text" });
        v.dispatch(tr);
        v.focus();
      },
    });
  }

  // 分割线
  if (schema.nodes.hr) {
    cmds.push({
      label: "分割线",
      keywords: "hr divider 分割线 横线",
      icon: "—",
      run: (v, anchor) => {
        const tr = v.state.tr.deleteRange(anchor, v.state.selection.from);
        v.dispatch(tr);
        const pos = v.state.selection.$from.after();
        v.dispatch(v.state.tr.insert(pos, schema.nodes.hr.create()));
        v.focus();
      },
    });
  }

  // 表格
  if (schema.nodes.table) {
    cmds.push({
      label: "表格",
      keywords: "table 表格",
      icon: "▦",
      run: (v, anchor) => {
        v.dispatch(v.state.tr.deleteRange(anchor, v.state.selection.from));
        const cell = schema.nodes.table_cell;
        const header = schema.nodes.table_header;
        const row = schema.nodes.table_row;
        if (!cell || !header || !row) {
          v.focus();
          return;
        }
        // table_cell / table_header 的 contentSpec 是 block 级（需 paragraph 等），
        // 不能直接塞 text node，否则节点结构非法会导致 cell 无法编辑。
        const makeRow = (isHeader: boolean) => {
          const cellType = isHeader ? header : cell;
          return row.create(null, [
            cellType.create(null, schema.nodes.paragraph.create()),
            cellType.create(null, schema.nodes.paragraph.create()),
          ]);
        };
        const table = schema.nodes.table.create(null, [makeRow(true), makeRow(false)]);
        const pos = v.state.selection.$from.after();
        v.dispatch(v.state.tr.insert(pos, table));
        v.focus();
      },
    });
  }

  // 块级公式
  if (schema.nodes.math_display) {
    cmds.push({
      label: "块级公式",
      keywords: "math formula 公式 display",
      icon: "∑",
      run: (v, anchor) => {
        v.dispatch(v.state.tr.deleteRange(anchor, v.state.selection.from));
        const pos = v.state.selection.$from.after();
        v.dispatch(v.state.tr.insert(pos, schema.nodes.math_display.create()));
        v.focus();
      },
    });
  }

  // Mermaid 图表
  if (schema.nodes.code_block) {
    cmds.push({
      label: "Mermaid 图表",
      keywords: "mermaid diagram 图表 流程图",
      icon: "☿",
      run: (v, anchor) => {
        const tr = v.state.tr.deleteRange(anchor, v.state.selection.from);
        tr.setNodeMarkup(anchor, schema.nodes.code_block, { language: "mermaid" });
        v.dispatch(tr);
        v.focus();
      },
    });
  }

  // callout（四种类型）
  if (schema.nodes.callout) {
    const calloutTypes: Array<{ t: "note" | "warning" | "tip" | "important"; label: string; kw: string }> = [
      { t: "note", label: "提示框：注意", kw: "callout note 提示 注意 info" },
      { t: "warning", label: "提示框：警告", kw: "callout warning 提示 警告 caution" },
      { t: "tip", label: "提示框：技巧", kw: "callout tip 提示 技巧 hint" },
      { t: "important", label: "提示框：重要", kw: "callout important 提示 重要" },
    ];
    for (const ct of calloutTypes) {
      cmds.push({
        label: ct.label,
        keywords: ct.kw,
        icon: "!",
        run: (v, anchor) => {
          v.dispatch(v.state.tr.deleteRange(anchor, v.state.selection.from));
          const pos = v.state.selection.$from.after();
          const callout = schema.nodes.callout.create(
            { calloutType: ct.t },
            schema.nodes.paragraph.create(),
          );
          v.dispatch(v.state.tr.insert(pos, callout));
          v.focus();
        },
      });
    }
  }

  // [TOC] 目录
  if (schema.nodes.toc) {
    cmds.push({
      label: "目录 [TOC]",
      keywords: "toc 目录 contents",
      icon: "☰",
      run: (v, anchor) => {
        v.dispatch(v.state.tr.deleteRange(anchor, v.state.selection.from));
        const pos = v.state.selection.$from.after();
        v.dispatch(v.state.tr.insert(pos, schema.nodes.toc.create()));
        v.focus();
      },
    });
  }

  // YAML Front Matter
  if (schema.nodes.frontmatter) {
    cmds.push({
      label: "YAML Front Matter",
      keywords: "frontmatter yaml 元数据",
      icon: "Y",
      run: (v, anchor) => {
        v.dispatch(v.state.tr.deleteRange(anchor, v.state.selection.from));
        const doc = v.state.doc;
        if (doc.firstChild?.type.name === "frontmatter") {
          v.focus();
          return;
        }
        const fm = schema.nodes.frontmatter.create({ value: "title: \ndate: " });
        v.dispatch(v.state.tr.insert(0, fm));
        v.focus();
      },
    });
  }

  return cmds;
}

interface SlashViewHandle {
  dom: HTMLDivElement;
  list: HTMLDivElement;
  items: HTMLDivElement[];
}

function renderPopup(
  handle: SlashViewHandle,
  commands: SlashCommand[],
  selectedIndex: number,
  onPick: (cmd: SlashCommand) => void,
  onHover: (index: number) => void,
): void {
  while (handle.list.firstChild) handle.list.removeChild(handle.list.firstChild);
  handle.items = [];

  commands.forEach((cmd, idx) => {
    const item = document.createElement("div");
    item.className = `slash-item${idx === selectedIndex ? " slash-item-active" : ""}`;

    const icon = document.createElement("span");
    icon.className = "slash-icon";
    icon.textContent = cmd.icon;

    const label = document.createElement("span");
    label.className = "slash-label";
    label.textContent = cmd.label;

    item.appendChild(icon);
    item.appendChild(label);
    item.addEventListener("mouseenter", () => onHover(idx));
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      onPick(cmd);
    });

    handle.list.appendChild(item);
    handle.items.push(item);
  });

  // 滚动选中项到可视区
  const activeEl = handle.items[selectedIndex];
  if (activeEl) {
    activeEl.scrollIntoView({ block: "nearest" });
  }
}

function positionPopup(handle: SlashViewHandle, view: EditorView): void {
  const coords = view.coordsAtPos(view.state.selection.$head.pos);
  const rect = handle.dom.getBoundingClientRect();
  let left = coords.left;
  let top = coords.bottom + 4;
  if (left + rect.width > window.innerWidth - 8) {
    left = window.innerWidth - rect.width - 8;
  }
  if (top + rect.height > window.innerHeight - 8) {
    top = coords.top - rect.height - 4;
  }
  handle.dom.style.left = `${Math.max(8, left)}px`;
  handle.dom.style.top = `${Math.max(8, top)}px`;
}

/** 斜杠菜单 ProseMirror 插件 */
export function slashMenuPlugin(): Plugin {
  let handle: SlashViewHandle | null = null;
  let currentCommands: SlashCommand[] = [];

  const ensureHandle = (onPick: (cmd: SlashCommand) => void, onHover: (index: number) => void): SlashViewHandle => {
    if (handle && handle.dom.isConnected) return handle;
    const dom = document.createElement("div");
    dom.className = "slash-popup";
    dom.style.display = "none";
    const list = document.createElement("div");
    list.className = "slash-list";
    dom.appendChild(list);
    document.body.appendChild(dom);
    handle = { dom, list, items: [] };
    // 存回调以便复用
    (dom as HTMLDivElement & { _pick?: (c: SlashCommand) => void; _hover?: (i: number) => void })._pick = onPick;
    (dom as HTMLDivElement & { _pick?: (c: SlashCommand) => void; _hover?: (i: number) => void })._hover = onHover;
    return handle;
  };

  const showPopup = (view: EditorView, commands: SlashCommand[], selectedIndex: number, onPick: (c: SlashCommand) => void, onHover: (i: number) => void) => {
    const h = ensureHandle(onPick, onHover);
    renderPopup(h, commands, selectedIndex, onPick, onHover);
    positionPopup(h, view);
    h.dom.style.display = "block";
  };

  const hidePopup = () => {
    if (handle) handle.dom.style.display = "none";
  };

  return new Plugin<SlashState>({
    key: slashKey,
    state: {
      init: () => initialState,
      apply: (tr, value, _oldState, newState) => {
        // 处理 setMeta 单独更新 selectedIndex（不改变文档/选区）
        const meta = tr.getMeta(slashKey) as { selectedIndex?: number } | undefined;
        if (meta && typeof meta.selectedIndex === "number" && !tr.docChanged && !tr.selectionSet) {
          return { ...value, selectedIndex: meta.selectedIndex };
        }
        // 选区/文档变化时重新推导状态
        if (tr.docChanged || tr.selectionSet || !value.active) {
          // 构造一个临时 view-like 对象读取 state（deriveState 只用到 state.selection）
          const fakeView = { state: newState } as unknown as EditorView;
          const derived = deriveState(fakeView, value);
          return derived;
        }
        return value;
      },
    },
    view: (view: EditorView) => {
      const onPick = (cmd: SlashCommand) => {
        const st = slashKey.getState(view.state);
        if (!st || !st.active) return;
        cmd.run(view, st.anchorPos);
        hidePopup();
        // 触发一次空 tr 让状态重新推导为关闭
        view.dispatch(view.state.tr.scrollIntoView());
      };
      const onHover = (index: number) => {
        const st = slashKey.getState(view.state);
        if (!st || !st.active) return;
        const filtered = currentCommands.filter((c) => matchCommand(c, st.query));
        if (handle) renderPopup(handle, filtered, index, onPick, onHover);
        // 用 setMeta 更新 selectedIndex（不触发文档变化）
        view.dispatch(view.state.tr.setMeta(slashKey, { selectedIndex: index }));
      };

      return {
        update: (v: EditorView) => {
          const st = slashKey.getState(v.state);
          if (!st || !st.active) {
            hidePopup();
            return;
          }
          if (currentCommands.length === 0) {
            currentCommands = buildCommands(v);
          }
          const filtered = currentCommands.filter((c) => matchCommand(c, st.query));
          if (filtered.length === 0) {
            hidePopup();
            return;
          }
          let sel = st.selectedIndex;
          if (sel >= filtered.length) sel = 0;
          showPopup(v, filtered, sel, onPick, onHover);
        },
        destroy: () => {
          hidePopup();
          if (handle) {
            handle.dom.remove();
            handle = null;
          }
          currentCommands = [];
        },
      };
    },
    props: {
      handleKeyDown: (view, event) => {
        const st = slashKey.getState(view.state);
        if (!st || !st.active) return false;
        const key = event.key;
        if (key === "ArrowDown" || key === "ArrowUp") {
          event.preventDefault();
          const filtered = currentCommands.filter((c) => matchCommand(c, st.query));
          if (filtered.length === 0) return true;
          let idx = st.selectedIndex;
          if (key === "ArrowDown") idx = (idx + 1) % filtered.length;
          else idx = (idx - 1 + filtered.length) % filtered.length;
          view.dispatch(view.state.tr.setMeta(slashKey, { selectedIndex: idx }));
          if (handle) renderPopup(handle, filtered, idx, (c) => { void c; }, () => {});
          return true;
        }
        if (key === "Enter") {
          event.preventDefault();
          const filtered = currentCommands.filter((c) => matchCommand(c, st.query));
          if (filtered.length === 0) return true;
          const cmd = filtered[st.selectedIndex] ?? filtered[0];
          cmd.run(view, st.anchorPos);
          hidePopup();
          view.dispatch(view.state.tr.scrollIntoView());
          return true;
        }
        if (key === "Escape") {
          event.preventDefault();
          hidePopup();
          view.dispatch(view.state.tr.scrollIntoView());
          return true;
        }
        return false;
      },
    },
  });
}
