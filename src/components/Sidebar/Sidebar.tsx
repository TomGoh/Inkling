// 侧边栏：工作区文件树 + 最近打开文件列表
// 支持文件/文件夹的右键菜单：重命名、删除、新建文件、新建文件夹
// 重命名采用行内输入框，回车确认，Esc 取消
// TreeNode 与右键菜单之间通过自定义事件通信，避免 props 层层透传

import { useState, useRef, useEffect, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { isTauri } from "@tauri-apps/api/core";
import { useWorkspace } from "../../store/workspace";
import {
  joinPath,
  renamePath,
  deletePath,
  createFile,
  createDir,
  type FileNode,
} from "../../lib/fs";
import "./Sidebar.css";

/** 判断是否为 Markdown 文件 */
function isMarkdown(name: string): boolean {
  return /\.md$/i.test(name);
}

/** 取文件名（路径最后一段） */
function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

/** 取父目录路径 */
function dirname(p: string): string {
  const idx = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
  return idx === -1 ? "" : p.slice(0, idx);
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

/** Sidebar 指令 TreeNode 执行的动作 */
type TreeAction =
  | { type: "rename"; path: string }
  | { type: "new"; parentPath: string; kind: "file" | "dir" };

/** 新建项的输入框状态 */
interface NewItemState {
  parentPath: string;
  kind: "file" | "dir";
}

/** 最近打开文件区块 */
function RecentFiles() {
  const recentFiles = useWorkspace((s) => s.recentFiles);
  const currentFile = useWorkspace((s) => s.currentFile);
  const openFile = useWorkspace((s) => s.openFile);
  const [expanded, setExpanded] = useState(true);

  if (recentFiles.length === 0) return null;

  return (
    <div className="recent-section">
      <button className="recent-header" onClick={() => setExpanded((v) => !v)}>
        <span className="tree-icon">{expanded ? "▾" : "▸"}</span>
        <span className="recent-title">最近打开</span>
      </button>
      {expanded && (
        <div className="recent-list">
          {recentFiles.map((path) => {
            const active = currentFile === path;
            return (
              <button
                key={path}
                className={`tree-row tree-row-file${active ? " tree-row-active" : ""}`}
                style={{ paddingLeft: "24px" }}
                title={path}
                onClick={() => openFile(path)}
              >
                <span className="tree-icon">📝</span>
                <span className="tree-name">{basename(path)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** 单个树节点（递归渲染） */
function TreeNode({ node, depth }: { node: FileNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const currentFile = useWorkspace((s) => s.currentFile);
  const openTabs = useWorkspace((s) => s.openTabs);
  const openFile = useWorkspace((s) => s.openFile);
  const onFileRenamed = useWorkspace((s) => s.onFileRenamed);
  const refreshTree = useWorkspace((s) => s.refreshTree);

  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.name);
  const [newItem, setNewItem] = useState<NewItemState | null>(null);
  const [newItemValue, setNewItemValue] = useState("");

  const renameInputRef = useRef<HTMLInputElement>(null);
  const newInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renaming]);

  useEffect(() => {
    if (newItem && newInputRef.current) {
      newInputRef.current.focus();
    }
  }, [newItem]);

  // 监听 Sidebar 派发的动作事件
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<TreeAction>).detail;
      if (!detail) return;
      if (detail.type === "rename" && detail.path === node.path) {
        setRenameValue(node.name);
        setRenaming(true);
      } else if (
        detail.type === "new" &&
        node.is_dir &&
        detail.parentPath === node.path
      ) {
        setNewItem({ parentPath: detail.parentPath, kind: detail.kind });
        setNewItemValue("");
        if (!expanded) setExpanded(true);
      }
    };
    window.addEventListener(TREE_ACTION_EVENT, handler);
    return () => window.removeEventListener(TREE_ACTION_EVENT, handler);
  }, [node.path, node.is_dir, expanded]);

  /** 触发右键菜单（向上冒泡到 Sidebar） */
  const triggerMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(
      new CustomEvent<MenuPayload>(TREE_MENU_EVENT, {
        detail: { node, x: e.clientX, y: e.clientY },
      }),
    );
  };

  /** 提交重命名 */
  const commitRename = async () => {
    const newName = renameValue.trim();
    if (!newName || newName === node.name) {
      setRenaming(false);
      return;
    }
    const parent = dirname(node.path);
    const to = parent ? joinPath(parent, newName) : newName;
    try {
      await renamePath(node.path, to);
      onFileRenamed(node.path, to);
    } catch (e) {
      alert(`重命名失败：${e instanceof Error ? e.message : String(e)}`);
    }
    setRenaming(false);
  };

  /** 提交新建 */
  const commitNew = async () => {
    if (!newItem) return;
    const name = newItemValue.trim();
    if (!name) {
      setNewItem(null);
      return;
    }
    const targetPath = joinPath(newItem.parentPath, name);
    try {
      if (newItem.kind === "file") {
        await createFile(targetPath);
        await openFile(targetPath);
      } else {
        await createDir(targetPath);
      }
      await refreshTree();
    } catch (e) {
      alert(`新建失败：${e instanceof Error ? e.message : String(e)}`);
    }
    setNewItem(null);
    setNewItemValue("");
  };

  // 目录：可折叠展开
  if (node.is_dir) {
    return (
      <div className="tree-node">
        {renaming ? (
          <div
            className="tree-row tree-row-rename"
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            <span className="tree-icon">▸</span>
            <input
              ref={renameInputRef}
              className="rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commitRename();
                else if (e.key === "Escape") setRenaming(false);
              }}
              onBlur={() => void commitRename()}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        ) : (
          <button
            className="tree-row tree-row-dir"
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
            onClick={() => setExpanded((v) => !v)}
            onContextMenu={triggerMenu}
          >
            <span className="tree-icon">{expanded ? "▾" : "▸"}</span>
            <span className="tree-name">{node.name}</span>
          </button>
        )}
        {expanded && (
          <div className="tree-children">
            {newItem && newItem.parentPath === node.path && (
              <div
                className="tree-row tree-row-new"
                style={{ paddingLeft: `${(depth + 1) * 12 + 24}px` }}
              >
                <span className="tree-icon">
                  {newItem.kind === "file" ? "📝" : "📁"}
                </span>
                <input
                  ref={newInputRef}
                  className="rename-input"
                  placeholder={newItem.kind === "file" ? "新文件.md" : "新目录"}
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
            )}
            {node.children.map((child) => (
              <TreeNode key={child.path} node={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // 文件：仅 .md 可点击打开
  const md = isMarkdown(node.name);
  const active = currentFile === node.path;
  const isOpen = openTabs.some((t) => t.path === node.path);

  if (renaming) {
    return (
      <div
        className="tree-row tree-row-rename"
        style={{ paddingLeft: `${depth * 12 + 24}px` }}
      >
        <span className="tree-icon">{md ? "📝" : "📄"}</span>
        <input
          ref={renameInputRef}
          className="rename-input"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commitRename();
            else if (e.key === "Escape") setRenaming(false);
          }}
          onBlur={() => void commitRename()}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    );
  }

  return (
    <button
      className={`tree-row tree-row-file${md ? "" : " tree-row-file-disabled"}${active ? " tree-row-active" : ""}`}
      style={{ paddingLeft: `${depth * 12 + 24}px` }}
      disabled={!md}
      onClick={() => openFile(node.path)}
      onContextMenu={triggerMenu}
    >
      <span className="tree-icon">{md ? "📝" : "📄"}</span>
      <span className="tree-name">{node.name}</span>
      {isOpen && !active && <span className="tree-open-dot" title="已打开" />}
    </button>
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
  const refreshTree = useWorkspace((s) => s.refreshTree);
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

  /** 派发动作事件给 TreeNode */
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
      await refreshTree();
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

  const { node, x, y } = payload;
  const isRoot = rootPath === node.path;

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
          onClick={() => dispatchAction({ type: "rename", path: node.path })}
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
  const loading = useWorkspace((s) => s.loading);
  const openWorkspace = useWorkspace((s) => s.openWorkspace);
  const [menu, setMenu] = useState<MenuPayload | null>(null);

  // 监听 TreeNode 派发的右键事件
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<MenuPayload>).detail;
      if (detail) setMenu(detail);
    };
    window.addEventListener(TREE_MENU_EVENT, handler);
    return () => window.removeEventListener(TREE_MENU_EVENT, handler);
  }, []);

  const handleOpenFolder = useCallback(async () => {
    if (!isTauri()) {
      await openWorkspace("/mock-workspace");
      return;
    }
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") {
      await openWorkspace(selected);
    }
  }, [openWorkspace]);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">
          {rootPath ? rootPath.split(/[\\/]/).pop() : "工作区"}
        </span>
        <button className="sidebar-btn" onClick={handleOpenFolder} title="打开文件夹">
          打开
        </button>
      </div>
      <div className="sidebar-tree">
        {loading && <div className="sidebar-empty">加载中…</div>}
        {!loading && !tree && (
          <div className="sidebar-empty">
            点击「打开」选择一个包含 .md 文件的文件夹
          </div>
        )}
        {!loading && tree && (
          <>
            <RecentFiles />
            <TreeNode node={tree} depth={0} />
          </>
        )}
      </div>
      {menu && <TreeContextMenu payload={menu} onClose={() => setMenu(null)} />}
    </aside>
  );
}

export default Sidebar;
