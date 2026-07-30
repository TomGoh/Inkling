// 多标签页栏
// 类似 VSCode：每个打开的文件一个 tab，点击切换、中键/×关闭。
// 关闭未保存文件时弹出确认，避免数据丢失。
// 右键弹出上下文菜单（关闭其他/关闭右侧/全部关闭/复制路径）。
// 支持拖拽重排标签页顺序。

import { useState } from "react";
import { useWorkspace, type OpenTab } from "../../store/workspace";
import { TabContextMenu } from "./TabContextMenu";
import "./TabsBar.css";

/** 取文件名（去目录路径） */
function baseName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export function TabsBar() {
  const openTabs = useWorkspace((s) => s.openTabs);
  const activeTabPath = useWorkspace((s) => s.activeTabPath);
  const switchTab = useWorkspace((s) => s.switchTab);
  const closeTab = useWorkspace((s) => s.closeTab);
  const reorderTabs = useWorkspace((s) => s.reorderTabs);

  // 右键菜单状态
  const [menu, setMenu] = useState<{ tab: OpenTab; x: number; y: number } | null>(null);
  // 拖拽状态：正在拖拽的 tab path，以及拖拽悬停的目标 path
  const [dragPath, setDragPath] = useState<string | null>(null);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);

  if (openTabs.length === 0) return null;

  const handleClose = (tab: OpenTab) => {
    if (tab.dirty) {
      const ok = window.confirm(
        `「${baseName(tab.path)}」有未保存的修改，确定关闭吗？`,
      );
      if (!ok) return;
    }
    closeTab(tab.path);
  };

  return (
    <div className="tabs-bar">
      <div className="tabs-list">
        {openTabs.map((tab) => {
          const active = tab.path === activeTabPath;
          const isDragOver = dragOverPath === tab.path && dragPath !== null;
          return (
            <div
              key={tab.path}
              className={`tab${active ? " tab-active" : ""}${isDragOver ? " tab-drag-over" : ""}`}
              title={tab.path}
              draggable
              onDragStart={(e) => {
                setDragPath(tab.path);
                e.dataTransfer.effectAllowed = "move";
                // Firefox 需要 setData 才能触发拖拽
                e.dataTransfer.setData("text/plain", tab.path);
              }}
              onDragEnd={() => {
                setDragPath(null);
                setDragOverPath(null);
              }}
              onDragOver={(e) => {
                if (dragPath === null || dragPath === tab.path) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOverPath(tab.path);
              }}
              onDragLeave={() => {
                if (dragOverPath === tab.path) setDragOverPath(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragPath && dragPath !== tab.path) {
                  reorderTabs(dragPath, tab.path);
                }
                setDragPath(null);
                setDragOverPath(null);
              }}
              onClick={() => switchTab(tab.path)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ tab, x: e.clientX, y: e.clientY });
              }}
              onMouseDown={(e) => {
                // 中键关闭
                if (e.button === 1) {
                  e.preventDefault();
                  handleClose(tab);
                }
              }}
            >
              <span className="tab-name">{baseName(tab.path)}</span>
              {tab.dirty && <span className="tab-dirty" title="未保存">●</span>}
              <button
                className="tab-close"
                title="关闭"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClose(tab);
                }}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
      {menu && (
        <TabContextMenu
          tab={menu.tab}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

export default TabsBar;
