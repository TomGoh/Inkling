// 侧边栏：工作区文件树 + 最近打开文件列表
// 支持文件/文件夹的右键菜单：重命名、删除、新建文件、新建文件夹
// 重命名采用行内输入框，回车确认，Esc 取消
// 文件树与右键菜单之间通过自定义事件通信，避免 props 层层透传

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { isTauri } from "@tauri-apps/api/core";
import { useWorkspace } from "../../store/workspace";
import { openInNewWindow } from "../../lib/newWindow";
import { flattenVisibleTree } from "../../lib/fileTree";
import {
  joinPath,
  renamePath,
  deletePath,
  createFile,
  createDir,
  type FileNode,
} from "../../lib/fs";
import {
  IconFolder,
  IconFile,
  IconFileText,
  IconStarFilled,
  IconChevronDown,
  IconChevronRight,
  IconAlertTriangle,
  IconX,
} from "../icons";
import "./Sidebar.css";

/** 判断是否为 Markdown 文件 */
function isMarkdown(name: string): boolean {
  return /\.(md|markdown)$/i.test(name);
}

/** 取文件名（路径最后一段） */
function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

/** 取父目录路径 */
function dirname(p: string): string {
  const idx = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
  if (idx < 0) return "";
  if (idx === 0) return p.slice(0, 1);
  if (idx === 2 && /^[a-zA-Z]:[\\/]/.test(p)) return p.slice(0, 3);
  return p.slice(0, idx);
}

/** 自定义事件名 */
const TREE_MENU_EVENT = "inkling-tree-menu";
const TREE_ACTION_EVENT = "inkling-tree-action";

/** 右键菜单传给 Sidebar 的载荷 */
interface MenuPayload {
  node: FileNode;
  x: number;
  y: number;
}

/** Sidebar 指令文件树执行的动作 */
type TreeAction =
  | { type: "rename"; node: FileNode }
  | { type: "new"; parentPath: string; kind: "file" | "dir" };

/** 新建项的输入框状态 */
interface NewItemState {
  parentPath: string;
  kind: "file" | "dir";
}

/** 文件树固定行高与视口外预渲染行数 */
const TREE_ROW_HEIGHT = 28;
const TREE_OVERSCAN = 8;
const TREE_FALLBACK_HEIGHT = 560;

/** 窗口化文件树中的一行 */
type FileTreeRow =
  | { kind: "node"; node: FileNode; depth: number }
  | { kind: "new"; parentPath: string; itemKind: "file" | "dir"; depth: number }
  | { kind: "loading"; path: string; depth: number }
  | { kind: "error"; path: string; message: string; depth: number };

/** 文件读取状态：局部提示加载或错误，不替换整棵文件树 */
function FileOpenStatus({ opening, error }: { opening: boolean; error?: string }) {
  if (opening) {
    return (
      <span className="tree-file-status tree-file-opening" aria-label="正在打开">
        <span className="tree-file-spinner" aria-hidden="true" />
      </span>
    );
  }
  if (error) {
    return (
      <span
        className="tree-file-status tree-file-error"
        aria-label="打开失败，点击重试"
        title={error}
      >
        <IconAlertTriangle size={12} />
      </span>
    );
  }
  return null;
}

/** 最近打开文件区块 */
function RecentFiles() {
  const recentFiles = useWorkspace((s) => s.recentFiles);
  const currentFile = useWorkspace((s) => s.currentFile);
  const openFile = useWorkspace((s) => s.openFile);
  const openingFiles = useWorkspace((s) => s.openingFiles);
  const fileOpenErrors = useWorkspace((s) => s.fileOpenErrors);
  const [expanded, setExpanded] = useState(true);

  if (recentFiles.length === 0) return null;

  return (
    <div className="recent-section">
      <button className="recent-header" onClick={() => setExpanded((v) => !v)}>
        <span className="tree-icon">
          {expanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
        </span>
        <span className="recent-title">最近打开</span>
      </button>
      {expanded && (
        <div className="recent-list">
          {recentFiles.map((path) => {
            const active = currentFile === path;
            const opening = openingFiles.has(path);
            const error = fileOpenErrors.get(path);
            return (
              <button
                key={path}
                className={`tree-row tree-row-file${active ? " tree-row-active" : ""}`}
                style={{ paddingLeft: "24px" }}
                title={error ?? path}
                aria-busy={opening || undefined}
                onClick={() => void openFile(path).catch(() => {})}
              >
                <span className="tree-icon">
                  <IconFileText size={14} />
                </span>
                <span className="tree-name">{basename(path)}</span>
                <FileOpenStatus opening={opening} error={error} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** 书签文件区块 */
function Bookmarks() {
  const bookmarks = useWorkspace((s) => s.bookmarks);
  const currentFile = useWorkspace((s) => s.currentFile);
  const openFile = useWorkspace((s) => s.openFile);
  const openingFiles = useWorkspace((s) => s.openingFiles);
  const fileOpenErrors = useWorkspace((s) => s.fileOpenErrors);
  const toggleBookmark = useWorkspace((s) => s.toggleBookmark);
  const [expanded, setExpanded] = useState(true);

  if (bookmarks.length === 0) return null;

  return (
    <div className="recent-section">
      <button className="recent-header" onClick={() => setExpanded((v) => !v)}>
        <span className="tree-icon">
          {expanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
        </span>
        <span className="recent-title">书签</span>
      </button>
      {expanded && (
        <div className="recent-list">
          {bookmarks.map((path) => {
            const active = currentFile === path;
            const opening = openingFiles.has(path);
            const error = fileOpenErrors.get(path);
            return (
              <div
                key={path}
                className={`tree-row tree-row-file${active ? " tree-row-active" : ""}`}
                style={{ paddingLeft: "24px" }}
                title={error ?? path}
              >
                <button
                  className="tree-row-main"
                  aria-busy={opening || undefined}
                  onClick={() => void openFile(path).catch(() => {})}
                >
                  <span className="tree-icon tree-icon-star">
                    <IconStarFilled size={13} />
                  </span>
                  <span className="tree-name">{basename(path)}</span>
                  <FileOpenStatus opening={opening} error={error} />
                </button>
                <button
                  className="tree-row-side"
                  title="取消书签"
                  onClick={() => toggleBookmark(path)}
                >
                  <IconX size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** 窗口化列表中的文件或目录行 */
function FileNodeRow({
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
      disabled={!md}
      onClick={onOpen}
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

/** 工作区文件树：按展开状态扁平化，并只渲染视口附近的行 */
function WorkspaceFileTree({ tree }: { tree: FileNode }) {
  const expandedDirs = useWorkspace((s) => s.expandedDirs);
  const loadedDirs = useWorkspace((s) => s.loadedDirs);
  const loadingDirs = useWorkspace((s) => s.loadingDirs);
  const directoryErrors = useWorkspace((s) => s.directoryErrors);
  const currentFile = useWorkspace((s) => s.currentFile);
  const openTabs = useWorkspace((s) => s.openTabs);
  const openingFiles = useWorkspace((s) => s.openingFiles);
  const fileOpenErrors = useWorkspace((s) => s.fileOpenErrors);
  const toggleDirExpanded = useWorkspace((s) => s.toggleDirExpanded);
  const setDirExpanded = useWorkspace((s) => s.setDirExpanded);
  const loadDirectory = useWorkspace((s) => s.loadDirectory);
  const openFile = useWorkspace((s) => s.openFile);
  const onFileRenamed = useWorkspace((s) => s.onFileRenamed);
  const refreshTree = useWorkspace((s) => s.refreshTree);

  const [renamingNode, setRenamingNode] = useState<FileNode | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [newItem, setNewItem] = useState<NewItemState | null>(null);
  const [newItemValue, setNewItemValue] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(TREE_FALLBACK_HEIGHT);

  const scrollRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const newInputRef = useRef<HTMLInputElement>(null);

  const openedPaths = useMemo(() => new Set(openTabs.map((tab) => tab.path)), [openTabs]);

  const rows = useMemo<FileTreeRow[]>(() => {
    const next: FileTreeRow[] = [];
    for (const row of flattenVisibleTree(tree, expandedDirs)) {
      next.push({ kind: "node", ...row });
      if (!row.node.is_dir || !expandedDirs.has(row.node.path)) continue;

      if (newItem?.parentPath === row.node.path) {
        next.push({
          kind: "new",
          parentPath: row.node.path,
          itemKind: newItem.kind,
          depth: row.depth + 1,
        });
      }
      if (loadingDirs.has(row.node.path)) {
        next.push({ kind: "loading", path: row.node.path, depth: row.depth + 1 });
      } else {
        const message = directoryErrors.get(row.node.path);
        if (message) {
          next.push({ kind: "error", path: row.node.path, message, depth: row.depth + 1 });
        }
      }
    }
    return next;
  }, [tree, expandedDirs, newItem, loadingDirs, directoryErrors]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const updateHeight = () => {
      if (element.clientHeight > 0) setViewportHeight(element.clientHeight);
    };
    updateHeight();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateHeight);
      return () => window.removeEventListener("resize", updateHeight);
    }
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!renamingNode || !renameInputRef.current) return;
    renameInputRef.current.focus();
    renameInputRef.current.select();
  }, [renamingNode]);

  useEffect(() => {
    if (newItem && newInputRef.current) newInputRef.current.focus();
  }, [newItem]);

  // 文件树动作只在容器上监听一次，避免监听器数量随节点增长
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<TreeAction>).detail;
      if (!detail) return;
      if (detail.type === "rename") {
        setRenamingNode(detail.node);
        setRenameValue(detail.node.name);
        return;
      }
      setNewItem({ parentPath: detail.parentPath, kind: detail.kind });
      setNewItemValue("");
      setDirExpanded(detail.parentPath, true);
    };
    window.addEventListener(TREE_ACTION_EVENT, handler);
    return () => window.removeEventListener(TREE_ACTION_EVENT, handler);
  }, [setDirExpanded]);

  const commitRename = useCallback(async () => {
    if (!renamingNode) return;
    const node = renamingNode;
    const newName = renameValue.trim();
    setRenamingNode(null);
    if (!newName || newName === node.name) return;

    const parent = dirname(node.path);
    const to = parent ? joinPath(parent, newName) : newName;
    try {
      await renamePath(node.path, to);
      onFileRenamed(node.path, to);
    } catch (e) {
      alert(`重命名失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }, [renamingNode, renameValue, onFileRenamed]);

  const commitNew = useCallback(async () => {
    if (!newItem) return;
    const item = newItem;
    const name = newItemValue.trim();
    setNewItem(null);
    setNewItemValue("");
    if (!name) return;

    const targetPath = joinPath(item.parentPath, name);
    try {
      if (item.kind === "file") {
        await createFile(targetPath);
        await openFile(targetPath);
      } else {
        await createDir(targetPath);
      }
      await refreshTree(item.parentPath);
    } catch (e) {
      alert(`新建失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }, [newItem, newItemValue, openFile, refreshTree]);

  const start = Math.max(0, Math.floor(scrollTop / TREE_ROW_HEIGHT) - TREE_OVERSCAN);
  const end = Math.min(
    rows.length,
    Math.ceil((scrollTop + viewportHeight) / TREE_ROW_HEIGHT) + TREE_OVERSCAN,
  );
  const visibleRows = rows.slice(start, end);

  return (
    <div
      ref={scrollRef}
      className="workspace-tree-scroll"
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      role="tree"
    >
      <div className="workspace-tree-spacer" style={{ height: `${rows.length * TREE_ROW_HEIGHT}px` }}>
        {visibleRows.map((row, offset) => {
          const index = start + offset;
          const rowStyle = { top: `${index * TREE_ROW_HEIGHT}px` };

          if (row.kind === "new") {
            return (
              <div
                key={`new:${row.parentPath}`}
                className="workspace-tree-virtual-row"
                style={rowStyle}
              >
                <div
                  className="tree-row tree-row-new"
                  style={{ paddingLeft: `${row.depth * 12 + 24}px` }}
                  data-tree-row
                >
                  <span className="tree-icon">
                    {row.itemKind === "file" ? (
                      <IconFileText size={14} />
                    ) : (
                      <IconFolder size={14} />
                    )}
                  </span>
                  <input
                    ref={newInputRef}
                    className="rename-input"
                    placeholder={row.itemKind === "file" ? "新文件.md" : "新目录"}
                    value={newItemValue}
                    onChange={(e) => setNewItemValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void commitNew();
                      else if (e.key === "Escape") setNewItem(null);
                    }}
                    onBlur={() => void commitNew()}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
            );
          }

          if (row.kind === "loading") {
            return (
              <div
                key={`loading:${row.path}`}
                className="workspace-tree-virtual-row"
                style={rowStyle}
              >
                <div
                  className="tree-row tree-row-status"
                  style={{ paddingLeft: `${row.depth * 12 + 24}px` }}
                >
                  加载中…
                </div>
              </div>
            );
          }

          if (row.kind === "error") {
            return (
              <div
                key={`error:${row.path}`}
                className="workspace-tree-virtual-row"
                style={rowStyle}
              >
                <button
                  className="tree-row tree-row-status tree-row-error"
                  style={{ paddingLeft: `${row.depth * 12 + 24}px` }}
                  title={row.message}
                  onClick={() => void loadDirectory(row.path, true).catch(() => {})}
                >
                  加载失败，点击重试
                </button>
              </div>
            );
          }

          const { node, depth } = row;
          return (
            <div
              key={node.path}
              className="workspace-tree-virtual-row"
              style={rowStyle}
              role="treeitem"
            >
              <FileNodeRow
                node={node}
                depth={depth}
                expanded={expandedDirs.has(node.path)}
                loaded={loadedDirs.has(node.path)}
                loading={loadingDirs.has(node.path)}
                error={directoryErrors.has(node.path)}
                active={currentFile === node.path}
                opened={openedPaths.has(node.path)}
                opening={openingFiles.has(node.path)}
                openError={fileOpenErrors.get(node.path)}
                renaming={renamingNode?.path === node.path}
                renameValue={renameValue}
                renameInputRef={renameInputRef}
                onRenameValue={setRenameValue}
                onCommitRename={commitRename}
                onCancelRename={() => setRenamingNode(null)}
                onToggle={() => toggleDirExpanded(node.path)}
                onOpen={() => void openFile(node.path).catch(() => {})}
                onMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  window.dispatchEvent(
                    new CustomEvent<MenuPayload>(TREE_MENU_EVENT, {
                      detail: { node, x: e.clientX, y: e.clientY },
                    }),
                  );
                }}
                loadDirectory={loadDirectory}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 文件树右键菜单 */
function TreeContextMenu({
  payload,
  onClose,
}: {
  payload: MenuPayload;
  onClose: () => void;
}) {
  const rootPath = useWorkspace((s) => s.rootPath);
  const openTabs = useWorkspace((s) => s.openTabs);
  const onFileDeleted = useWorkspace((s) => s.onFileDeleted);
  const toggleBookmark = useWorkspace((s) => s.toggleBookmark);
  const isBookmarked = useWorkspace((s) => s.isBookmarked);
  const ref = useRef<HTMLDivElement>(null);

  // 点击外部或 Esc 关闭
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  /** 派发动作事件给文件树 */
  const dispatchAction = (action: TreeAction) => {
    window.dispatchEvent(new CustomEvent(TREE_ACTION_EVENT, { detail: action }));
    onClose();
  };

  /** 删除文件/目录，未保存的 tab 会弹确认（closeTab 内部处理） */
  const handleDelete = async () => {
    const { node } = payload;
    const msg = node.is_dir
      ? `确定删除文件夹「${node.name}」及其所有内容吗？`
      : `确定删除「${node.name}」吗？`;
    if (!window.confirm(msg)) {
      onClose();
      return;
    }
    // 如果有未保存的 tab 被影响，提示
    if (node.is_dir) {
      const affected = openTabs.filter((t) => t.path.startsWith(node.path));
      const dirty = affected.filter((t) => t.dirty);
      if (dirty.length > 0) {
        const ok = window.confirm(
          `文件夹下有 ${dirty.length} 个未保存的文件，删除将丢失这些修改，确定继续吗？`,
        );
        if (!ok) {
          onClose();
          return;
        }
      }
    } else {
      const tab = openTabs.find((t) => t.path === node.path);
      if (tab?.dirty) {
        const ok = window.confirm(
          `「${node.name}」有未保存的修改，删除将丢失修改，确定继续吗？`,
        );
        if (!ok) {
          onClose();
          return;
        }
      }
    }
    try {
      await deletePath(node.path);
      onFileDeleted(node.path);
    } catch (e) {
      alert(`删除失败：${e instanceof Error ? e.message : String(e)}`);
    }
    onClose();
  };

  /** 复制路径 */
  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(payload.node.path);
    } catch {
      // 忽略
    }
    onClose();
  };

  /** 在新窗口打开文件（仅桌面端；浏览器回退到当前窗口新 tab） */
  const handleOpenInNewWindow = async () => {
    try {
      const ok = await openInNewWindow(payload.node.path);
      if (!ok) {
        // 浏览器端无多窗口，回退到当前窗口打开
        await useWorkspace.getState().openFile(payload.node.path);
      }
    } catch (e) {
      alert(`打开文件失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      onClose();
    }
  };

  const { node, x, y } = payload;
  const isRoot = rootPath === node.path;
  const isMdFile = !node.is_dir && isMarkdown(node.name);

  return (
    <div className="tree-context-backdrop">
      <div
        ref={ref}
        className="tree-context-menu"
        style={{ left: x, top: y }}
        role="menu"
      >
        {node.is_dir && (
          <>
            <button
              className="tree-context-item"
              onClick={() =>
                dispatchAction({ type: "new", parentPath: node.path, kind: "file" })
              }
            >
              新建文件
            </button>
            <button
              className="tree-context-item"
              onClick={() =>
                dispatchAction({ type: "new", parentPath: node.path, kind: "dir" })
              }
            >
              新建文件夹
            </button>
            <div className="tree-context-sep" />
          </>
        )}
        <button
          className="tree-context-item"
          onClick={() => dispatchAction({ type: "rename", node })}
          disabled={isRoot}
          title={isRoot ? "工作区根目录不能重命名" : ""}
        >
          重命名
        </button>
        <button
          className="tree-context-item tree-context-danger"
          onClick={() => void handleDelete()}
          disabled={isRoot}
          title={isRoot ? "工作区根目录不能删除" : ""}
        >
          删除
        </button>
        <div className="tree-context-sep" />
        {!node.is_dir && (
          <>
            <button
              className="tree-context-item"
              onClick={() => {
                toggleBookmark(node.path);
                onClose();
              }}
            >
              {isBookmarked(node.path) ? "取消书签" : "加入书签"}
            </button>
            {isMdFile && (
              <button
                className="tree-context-item"
                onClick={() => void handleOpenInNewWindow()}
              >
                在新窗口打开
              </button>
            )}
            <div className="tree-context-sep" />
          </>
        )}
        <button className="tree-context-item" onClick={() => void handleCopyPath()}>
          复制路径
        </button>
      </div>
    </div>
  );
}

export function Sidebar() {
  const rootPath = useWorkspace((s) => s.rootPath);
  const tree = useWorkspace((s) => s.tree);
  const workspaceLoading = useWorkspace((s) => s.workspaceLoading);
  const openWorkspace = useWorkspace((s) => s.openWorkspace);
  const openFileStandalone = useWorkspace((s) => s.openFileStandalone);
  const recentFiles = useWorkspace((s) => s.recentFiles);
  const bookmarks = useWorkspace((s) => s.bookmarks);
  const [menu, setMenu] = useState<MenuPayload | null>(null);

  // 监听文件树派发的右键事件
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<MenuPayload>).detail;
      if (detail) setMenu(detail);
    };
    window.addEventListener(TREE_MENU_EVENT, handler);
    return () => window.removeEventListener(TREE_MENU_EVENT, handler);
  }, []);

  const handleOpenFolder = useCallback(async () => {
    try {
      if (!isTauri()) {
        await openWorkspace("/mock-workspace");
        return;
      }
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === "string") {
        await openWorkspace(selected);
      }
    } catch (e) {
      alert(`打开工作区失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }, [openWorkspace]);

  // 打开单个 md 文件（单文件模式）：不绑定文件夹，可继续打开散落在不同目录的 md 作为标签页
  const handleOpenFile = useCallback(async () => {
    try {
      if (!isTauri()) {
        await openFileStandalone("/mock-workspace/intro.md");
        return;
      }
      const selected = await open({
        directory: false,
        multiple: false,
        filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
      });
      if (typeof selected === "string") {
        await openFileStandalone(selected);
      }
    } catch (e) {
      alert(`打开文件失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }, [openFileStandalone]);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">
          {rootPath ? rootPath.split(/[\\/]/).pop() : "工作区"}
        </span>
        <div className="sidebar-actions">
          <button
            className="sidebar-btn-icon"
            onClick={handleOpenFolder}
            title="打开文件夹"
            aria-label="打开文件夹"
          >
            <IconFolder size={16} />
          </button>
          <button
            className="sidebar-btn-icon"
            onClick={handleOpenFile}
            title="打开 Markdown 文件"
            aria-label="打开 Markdown 文件"
          >
            <IconFileText size={16} />
          </button>
        </div>
      </div>
      <div className="sidebar-tree">
        {workspaceLoading && <div className="sidebar-empty">加载中…</div>}
        {!workspaceLoading && tree && (
          <>
            <RecentFiles />
            <Bookmarks />
            <WorkspaceFileTree key={tree.path} tree={tree} />
          </>
        )}
        {!workspaceLoading && !tree && (recentFiles.length > 0 || bookmarks.length > 0) && (
          <>
            <RecentFiles />
            <Bookmarks />
          </>
        )}
        {!workspaceLoading && !tree && recentFiles.length === 0 && bookmarks.length === 0 && (
          <div className="sidebar-empty">
            点击右上角按钮打开文件夹，或打开单个 Markdown 文件开始编辑
          </div>
        )}
      </div>
      {menu && <TreeContextMenu payload={menu} onClose={() => setMenu(null)} />}
    </aside>
  );
}

export default Sidebar;
