import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { isTauri } from "@tauri-apps/api/core";
import { useWorkspace } from "../../store/workspace";
import type { FileNode } from "../../lib/fs";
import "./Sidebar.css";

/** 判断是否为 Markdown 文件 */
function isMarkdown(name: string): boolean {
  return /\.md$/i.test(name);
}

/** 单个树节点（递归渲染） */
function TreeNode({ node, depth }: { node: FileNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const currentFile = useWorkspace((s) => s.currentFile);
  const openTabs = useWorkspace((s) => s.openTabs);
  const openFile = useWorkspace((s) => s.openFile);

  // 目录：可折叠展开
  if (node.is_dir) {
    return (
      <div className="tree-node">
        <button
          className="tree-row tree-row-dir"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="tree-icon">{expanded ? "▾" : "▸"}</span>
          <span className="tree-name">{node.name}</span>
        </button>
        {expanded && node.children.length > 0 && (
          <div className="tree-children">
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
  return (
    <button
      className={`tree-row tree-row-file${md ? "" : " tree-row-file-disabled"}${active ? " tree-row-active" : ""}`}
      style={{ paddingLeft: `${depth * 12 + 24}px` }}
      disabled={!md}
      onClick={() => openFile(node.path)}
    >
      <span className="tree-icon">{md ? "📝" : "📄"}</span>
      <span className="tree-name">{node.name}</span>
      {isOpen && !active && <span className="tree-open-dot" title="已打开" />}
    </button>
  );
}

export function Sidebar() {
  const rootPath = useWorkspace((s) => s.rootPath);
  const tree = useWorkspace((s) => s.tree);
  const loading = useWorkspace((s) => s.loading);
  const openWorkspace = useWorkspace((s) => s.openWorkspace);

  async function handleOpenFolder() {
    if (!isTauri()) {
      // 浏览器 mock：直接打开 mock 工作区
      await openWorkspace("/mock-workspace");
      return;
    }
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") {
      await openWorkspace(selected);
    }
  }

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
          <TreeNode node={tree} depth={0} />
        )}
      </div>
    </aside>
  );
}

export default Sidebar;
