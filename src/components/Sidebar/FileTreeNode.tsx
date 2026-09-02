// 文件树节点行（issue #50 从 Sidebar 抽出为 FileTreeNode）
// 覆盖三种形态：重命名输入态、目录行、文件行（含打开中/错误/已打开徽标）。

import { useEffect } from "react";
import type { FileNode } from "../../lib/fs";
import {
  IconChevronDown,
  IconChevronRight,
  IconFile,
  IconFileText,
} from "../icons";
import { FileOpenStatus } from "./FileOpenStatus";
import { isMarkdown } from "./treeShared";

export function FileTreeNode({
  node,
  depth,
  expanded,
  loaded,
  loading,
  error,
  active,
  opened,
  opening,
  openError,
  renaming,
  renameValue,
  renameInputRef,
  onRenameValue,
  onCommitRename,
  onCancelRename,
  onToggle,
  onOpen,
  onMenu,
  loadDirectory,
}: {
  node: FileNode;
  depth: number;
  expanded: boolean;
  loaded: boolean;
  loading: boolean;
  error: boolean;
  active: boolean;
  opened: boolean;
  opening: boolean;
  openError?: string;
  renaming: boolean;
  renameValue: string;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  onRenameValue: (value: string) => void;
  onCommitRename: () => Promise<void>;
  onCancelRename: () => void;
  onToggle: () => void;
  onOpen: () => void;
  onMenu: (e: React.MouseEvent) => void;
  loadDirectory: (path: string, force?: boolean) => Promise<void>;
}) {
  // 恢复持久化展开状态时，仅为进入渲染视口的目录加载子项
  useEffect(() => {
    if (!node.is_dir || !expanded || loaded || loading || error) return;
    void loadDirectory(node.path).catch(() => {});
  }, [node.is_dir, node.path, expanded, loaded, loading, error, loadDirectory]);

  if (renaming) {
    return (
      <div
        className="tree-row tree-row-rename"
        style={{ paddingLeft: `${depth * 12 + (node.is_dir ? 8 : 24)}px` }}
        data-tree-row
        data-path={node.path}
      >
        <span className="tree-icon">
          {node.is_dir ? (
            <IconChevronRight size={12} />
          ) : isMarkdown(node.name) ? (
            <IconFileText size={14} />
          ) : (
            <IconFile size={14} />
          )}
        </span>
        <input
          ref={renameInputRef}
          className="rename-input"
          value={renameValue}
          onChange={(e) => onRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void onCommitRename();
            else if (e.key === "Escape") onCancelRename();
          }}
          onBlur={() => void onCommitRename()}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    );
  }

  if (node.is_dir) {
    return (
      <button
        className="tree-row tree-row-dir"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={onToggle}
        onContextMenu={onMenu}
        aria-expanded={expanded}
        data-tree-row
        data-path={node.path}
      >
        <span className="tree-icon">
          {expanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
        </span>
        <span className="tree-name">{node.name}</span>
      </button>
    );
  }

  const md = isMarkdown(node.name);
  return (
    <button
      className={`tree-row tree-row-file${md ? "" : " tree-row-file-disabled"}${active ? " tree-row-active" : ""}`}
      style={{ paddingLeft: `${depth * 12 + 24}px` }}
      // issue #158：不用原生 disabled——Chromium/WebView2 对 disabled 表单控件
      // 抑制 contextmenu 等鼠标事件，非 md 文件会完全失去右键菜单（重命名/删除
      // 等唯一可用操作）。改 aria-disabled 表达禁用态，onClick 内拦截打开。
      aria-disabled={!md || undefined}
      onClick={() => {
        if (md) onOpen();
      }}
      onContextMenu={onMenu}
      title={openError ?? node.path}
      aria-busy={opening || undefined}
      data-tree-row
      data-path={node.path}
    >
      <span className="tree-icon">
        {md ? <IconFileText size={14} /> : <IconFile size={14} />}
      </span>
      <span className="tree-name">{node.name}</span>
      <FileOpenStatus opening={opening} error={openError} />
      {!opening && !openError && opened && !active && (
        <span className="tree-open-dot" title="已打开" />
      )}
    </button>
  );
}
