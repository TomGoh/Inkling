import { useEffect, useRef, useState } from "react";
import type { CmdKey, Editor } from "@milkdown/kit/core";
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
import "./TableToolbar.css";

interface TableToolbarProps {
  getEditor: () => Editor | undefined;
  inTable: boolean;
}

/** 网格选择器最大尺寸 */
const GRID = 8;

type Align = "left" | "center" | "right";

export function TableToolbar({ getEditor, inTable }: TableToolbarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hover, setHover] = useState({ row: 1, col: 1 });
  const pickerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭网格选择器
  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [pickerOpen]);

  /** 调用 Milkdown 命令并重新聚焦编辑器 */
  const callCmd = <T,>(key: CmdKey<T>, payload?: T) => {
    const editor = getEditor();
    if (!editor) return;
    editor.action((ctx) => {
      ctx.get(commandsCtx).call(key, payload as T);
      ctx.get(editorViewCtx).focus();
    });
  };

  const insertTable = (row: number, col: number) => {
    callCmd(insertTableCommand.key, { row, col });
    setPickerOpen(false);
  };

  // 删除整张表格：先全选表格再删除
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

  const setAlign = (a: Align) => callCmd(setAlignCommand.key, a);

  return (
    <div className="table-toolbar">
      <div className="tt-group">
        <button
          className="tt-btn tt-has-picker"
          onClick={() => setPickerOpen((v) => !v)}
          title="插入表格"
        >
          <span className="tt-icon">▦</span>
          <span>表格</span>
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
      </div>

      {inTable && (
        <>
          <span className="tt-sep" />
          <div className="tt-group">
            <button
              className="tt-btn"
              onClick={() => callCmd(addRowBeforeCommand.key)}
              title="在上方插入行"
            >
              ↕ 上行
            </button>
            <button
              className="tt-btn"
              onClick={() => callCmd(addRowAfterCommand.key)}
              title="在下方插入行"
            >
              ↕ 下行
            </button>
            <button
              className="tt-btn"
              onClick={() => callCmd(deleteSelectedCellsCommand.key)}
              title="删除当前行（先选中行）"
            >
              ✕ 删行
            </button>
          </div>

          <span className="tt-sep" />

          <div className="tt-group">
            <button
              className="tt-btn"
              onClick={() => callCmd(addColBeforeCommand.key)}
              title="在左侧插入列"
            >
              ↔ 左列
            </button>
            <button
              className="tt-btn"
              onClick={() => callCmd(addColAfterCommand.key)}
              title="在右侧插入列"
            >
              ↔ 右列
            </button>
            <button
              className="tt-btn"
              onClick={() => callCmd(deleteSelectedCellsCommand.key)}
              title="删除当前列（先选中列）"
            >
              ✕ 删列
            </button>
          </div>

          <span className="tt-sep" />

          <div className="tt-group">
            <button className="tt-btn" onClick={() => setAlign("left")} title="左对齐">
              ⬅
            </button>
            <button className="tt-btn" onClick={() => setAlign("center")} title="居中">
              ⬌
            </button>
            <button className="tt-btn" onClick={() => setAlign("right")} title="右对齐">
              ➡
            </button>
          </div>

          <span className="tt-sep" />

          <div className="tt-group">
            <button className="tt-btn tt-danger" onClick={deleteTable} title="删除整张表格">
              删除表格
            </button>
          </div>
        </>
      )}
    </div>
  );
}
