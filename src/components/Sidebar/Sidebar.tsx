// 侧边栏外壳：工作区头部 + 最近打开 / 书签区块 + 文件树 + 右键菜单挂载
// 渲染与交互细节拆分（issue #50）：
// - 文件树窗口化容器 → WorkspaceFileTree.tsx
// - 树节点行 → FileTreeNode.tsx；右键菜单 → TreeContextMenu.tsx
// - 重命名 / 新建流程 → useRename.ts / useNewItem.ts
// - 最近打开 / 书签区块 → RecentFiles.tsx / Bookmarks.tsx
// 文件树与右键菜单之间通过自定义事件通信，避免 props 层层透传。

import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { isTauri } from "@tauri-apps/api/core";
import { useWorkspace } from "../../store/workspace";
import { showMessage } from "../../lib/dialogs";
import { IconFileText, IconFolder } from "../icons";
import { RecentFiles } from "./RecentFiles";
import { Bookmarks } from "./Bookmarks";
import { DeletedSnapshots } from "./DeletedSnapshots";
import { WorkspaceFileTree } from "./WorkspaceFileTree";
import { TreeContextMenu } from "./TreeContextMenu";
import { TREE_MENU_EVENT, type MenuPayload } from "./treeShared";
import "./Sidebar.css";

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
      await showMessage(`打开工作区失败：${e instanceof Error ? e.message : String(e)}`, { kind: "error" });
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
      await showMessage(`打开文件失败：${e instanceof Error ? e.message : String(e)}`, { kind: "error" });
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
        <DeletedSnapshots />
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
