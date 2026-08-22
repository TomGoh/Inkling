import { useEffect, useRef, useState } from "react";
import type { CmdKey, Editor } from "@milkdown/kit/core";
import type { EditorView } from "@milkdown/kit/prose/view";
import { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
import {
  insertTableCommand,
  addRowBeforeCommand,
  addRowAfterCommand,
  addColBeforeCommand,
  addColAfterCommand,
  deleteSelectedCellsCommand,
  setAlignCommand,
  selectTableCommand,
} from "@milkdown/kit/preset/gfm";
import { deleteColumn, deleteRow } from "@milkdown/kit/prose/tables";
import {
  turnIntoHeading,
  wrapBulletList,
  wrapOrderedList,
  wrapBlockquote,
  turnIntoCodeBlock,
  insertHr,
  insertMathBlock,
  insertInlineMath,
  turnIntoMermaid,
  insertCallout,
  insertToc,
  insertFrontmatter,
  deleteCurrentBlock,
  exitListIfNeeded,
} from "./block-commands";
import {
  IconHeading1,
  IconHeading2,
  IconHeading3,
  IconList,
  IconListOrdered,
  IconQuote,
  IconCode,
  IconPlus,
  IconTable,
  IconSigma,
  IconInfo,
  IconAlignLeft,
  IconAlignCenter,
  IconAlignRight,
  IconTrash,
  IconChevronDown,
} from "../icons";
import "./TableToolbar.css";

export interface BlockToolbarProps {
  getEditor: () => Editor | undefined;
  inTable: boolean;
}

/** 网格选择器最大尺寸 */
const GRID = 8;

type Align = "left" | "center" | "right";

export function TableToolbar({ getEditor, inTable }: BlockToolbarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [hover, setHover] = useState({ row: 1, col: 1 });
  const pickerRef = useRef<HTMLDivElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭弹层
  useEffect(() => {
    if (!pickerOpen && !overflowOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (pickerRef.current && !pickerRef.current.contains(target)) {
        setPickerOpen(false);
      }
      if (overflowRef.current && !overflowRef.current.contains(target)) {
        setOverflowOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [pickerOpen, overflowOpen]);

  /** 调用 Milkdown 命令并重新聚焦编辑器 */
  const callCmd = <T,>(key: CmdKey<T>, payload?: T) => {
    const editor = getEditor();
    if (!editor) return;
    editor.action((ctx) => {
      ctx.get(commandsCtx).call(key, payload as T);
      ctx.get(editorViewCtx).focus();
    });
  };

  /** 用 EditorView 执行块级插入/转换命令 */
  const withView = (fn: (view: EditorView) => void) => {
    const editor = getEditor();
    if (!editor) return;
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      fn(view);
    });
  };

  const insertTable = (row: number, col: number) => {
    const editor = getEditor();
    if (!editor) return;
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      exitListIfNeeded(view);
      const commands = ctx.get(commandsCtx);
      commands.call(insertTableCommand.key, { row, col });
      view.focus();
    });
    setPickerOpen(false);
    setOverflowOpen(false);
  };

  // 删除整张表格
  const deleteTable = () => {
    const editor = getEditor();
    if (!editor) return;
    editor.action((ctx) => {
      const commands = ctx.get(commandsCtx);
      commands.call(selectTableCommand.key);
      commands.call(deleteSelectedCellsCommand.key);
      ctx.get(editorViewCtx).focus();
    });
  };

  // 删除当前列
  const deleteCol = () => {
    const editor = getEditor();
    if (!editor) return;
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      deleteColumn(view.state, view.dispatch.bind(view));
      view.focus();
    });
  };

  // 删除当前行
  const deleteRow_ = () => {
    const editor = getEditor();
    if (!editor) return;
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      deleteRow(view.state, view.dispatch.bind(view));
      view.focus();
    });
  };

  const setAlign = (a: Align) => callCmd(setAlignCommand.key, a);

  return (
    <div className="table-toolbar block-toolbar" role="toolbar" aria-label="格式与块工具栏">
      {/* 高频核心转换按钮（SVG 图标、等宽） */}
      <div className="tt-group">
        <button
          className="tt-btn"
          onClick={() => withView((v) => turnIntoHeading(v, 1))}
          title="标题 1"
          aria-label="标题 1"
        >
          <IconHeading1 size={15} />
        </button>
        <button
          className="tt-btn"
          onClick={() => withView((v) => turnIntoHeading(v, 2))}
          title="标题 2"
          aria-label="标题 2"
        >
          <IconHeading2 size={15} />
        </button>
        <button
          className="tt-btn"
          onClick={() => withView((v) => turnIntoHeading(v, 3))}
          title="标题 3"
          aria-label="标题 3"
        >
          <IconHeading3 size={15} />
        </button>
      </div>

      <span className="tt-sep" />

      <div className="tt-group">
        <button
          className="tt-btn"
          onClick={() => withView(wrapBulletList)}
          title="无序列表"
          aria-label="无序列表"
        >
          <IconList size={15} />
        </button>
        <button
          className="tt-btn"
          onClick={() => withView(wrapOrderedList)}
          title="有序列表"
          aria-label="有序列表"
        >
          <IconListOrdered size={15} />
        </button>
        <button
          className="tt-btn"
          onClick={() => withView(wrapBlockquote)}
          title="引用块"
          aria-label="引用块"
        >
          <IconQuote size={15} />
        </button>
        <button
          className="tt-btn"
          onClick={() => withView(turnIntoCodeBlock)}
          title="代码块"
          aria-label="代码块"
        >
          <IconCode size={15} />
        </button>
      </div>

      <span className="tt-sep" />

      {/* 插入菜单溢出项 */}
      <div className="tt-group tt-overflow-wrap" ref={overflowRef}>
        <button
          className={`tt-btn tt-btn-labeled tt-overflow-btn ${overflowOpen ? "active" : ""}`}
          onClick={() => setOverflowOpen((v) => !v)}
          title="插入扩展元素 (表格/公式/图表/提示框/元数据等)"
          aria-expanded={overflowOpen}
        >
          <IconPlus size={14} />
          <span>插入</span>
          <IconChevronDown size={12} />
        </button>

        {overflowOpen && (
          <div className="tt-overflow-menu" role="menu">
            <button
              className="tt-menu-item"
              role="menuitem"
              title="插入表格"
              onClick={() => {
                setPickerOpen((v) => !v);
              }}
            >
              <IconTable size={15} />
              <span>表格</span>
              <span className="tt-menu-hint">网格选择</span>
            </button>
            {pickerOpen && (
              <div className="table-picker" ref={pickerRef}>
                <div className="picker-grid">
                  {Array.from({ length: GRID }).map((_, r) =>
                    Array.from({ length: GRID }).map((__, c) => (
                      <button
                        key={`${r}-${c}`}
                        className={`picker-cell ${r < hover.row && c < hover.col ? "active" : ""}`}
                        onMouseEnter={() => setHover({ row: r + 1, col: c + 1 })}
                        onClick={() => insertTable(r + 1, c + 1)}
                      />
                    ))
                  )}
                </div>
                <div className="picker-label">
                  {hover.row} 行 × {hover.col} 列
                </div>
              </div>
            )}

            <button
              className="tt-menu-item"
              role="menuitem"
              title="插入块级公式"
              onClick={() => {
                withView(insertMathBlock);
                setOverflowOpen(false);
              }}
            >
              <IconSigma size={15} />
              <span>块级公式</span>
            </button>

            <button
              className="tt-menu-item"
              role="menuitem"
              title="插入行内公式"
              onClick={() => {
                withView(insertInlineMath);
                setOverflowOpen(false);
              }}
            >
              <span className="tt-item-badge">$</span>
              <span>行内公式</span>
            </button>

            <button
              className="tt-menu-item"
              role="menuitem"
              title="Mermaid 图表"
              onClick={() => {
                withView(turnIntoMermaid);
                setOverflowOpen(false);
              }}
            >
              <span className="tt-item-badge">📊</span>
              <span>Mermaid 图表</span>
            </button>

            <button
              className="tt-menu-item"
              role="menuitem"
              onClick={() => {
                withView((v) => insertCallout(v, "note"));
                setOverflowOpen(false);
              }}
            >
              <IconInfo size={15} />
              <span>提示框</span>
            </button>

            <button
              className="tt-menu-item"
              role="menuitem"
              onClick={() => {
                withView(insertToc);
                setOverflowOpen(false);
              }}
            >
              <IconAlignLeft size={15} />
              <span>目录 (TOC)</span>
            </button>

            <button
              className="tt-menu-item"
              role="menuitem"
              onClick={() => {
                withView(insertHr);
                setOverflowOpen(false);
              }}
            >
              <span className="tt-item-badge">—</span>
              <span>分割线</span>
            </button>

            <button
              className="tt-menu-item"
              role="menuitem"
              onClick={() => {
                withView(insertFrontmatter);
                setOverflowOpen(false);
              }}
            >
              <span className="tt-item-badge">YAML</span>
              <span>Front Matter 元数据</span>
            </button>

            <div className="tt-menu-divider" />

            <button
              className="tt-menu-item tt-menu-danger"
              role="menuitem"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                withView(deleteCurrentBlock);
                setOverflowOpen(false);
              }}
            >
              <IconTrash size={15} />
              <span>删除当前块</span>
            </button>
          </div>
        )}
      </div>

      {/* 表格上下文条：光标进入表格才显示 */}
      {inTable && (
        <>
          <span className="tt-sep" />
          <div className="tt-group tt-context-table" aria-label="表格操作">
            <button
              className="tt-btn"
              onClick={() => callCmd(addRowBeforeCommand.key)}
              title="在上方插入行"
            >
              +上行
            </button>
            <button
              className="tt-btn"
              onClick={() => callCmd(addRowAfterCommand.key)}
              title="在下方插入行"
            >
              +下行
            </button>
            <button className="tt-btn" onClick={deleteRow_} title="删除当前行">
              删行
            </button>
            <span className="tt-sep-mini" />
            <button
              className="tt-btn"
              onClick={() => callCmd(addColBeforeCommand.key)}
              title="在左侧插入列"
            >
              +左列
            </button>
            <button
              className="tt-btn"
              onClick={() => callCmd(addColAfterCommand.key)}
              title="在右侧插入列"
            >
              +右列
            </button>
            <button className="tt-btn" onClick={deleteCol} title="删除当前列">
              删列
            </button>
            <span className="tt-sep-mini" />
            <button
              className="tt-btn"
              onClick={() => setAlign("left")}
              title="左对齐"
              aria-label="左对齐"
            >
              <IconAlignLeft size={14} />
            </button>
            <button
              className="tt-btn"
              onClick={() => setAlign("center")}
              title="居中"
              aria-label="居中对齐"
            >
              <IconAlignCenter size={14} />
            </button>
            <button
              className="tt-btn"
              onClick={() => setAlign("right")}
              title="右对齐"
              aria-label="右对齐"
            >
              <IconAlignRight size={14} />
            </button>
            <span className="tt-sep-mini" />
            <button
              className="tt-btn tt-danger"
              onClick={deleteTable}
              title="删除整张表格"
            >
              删除表格
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export { TableToolbar as BlockToolbar };
