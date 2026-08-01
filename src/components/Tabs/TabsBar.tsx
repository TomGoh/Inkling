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

/** tab 显示名：未命名草稿显示「未命名 N」，普通文件显示文件名 */
function tabLabel(tab: OpenTab): string {
  if (tab.isUntitled) {
    const m = tab.path.match(/(\d+)$/);
    return m ? `未命名 ${m[1]}` : "未命名";
  }
  return baseName(tab.path);
}

export function TabsBar() {
  // 仅订阅 tab 的展示字段（path/dirty/isUntitled），避免 content 每次按键变化时重渲染。
  // useWorkspace 默认用 Object.is 比较，这里返回 string 快照，内容变化时快照不变。
  const tabsSig = useWorkspace((s) =>
    s.openTabs.map((t) => `${t.path}|${t.dirty ? "1" : "0"}|${t.isUntitled ? "1" : "0"}`).join("\n"),
  );
  const activeTabPath = useWorkspace((s) => s.activeTabPath);
  const switchTab = useWorkspace((s) => s.switchTab);
  const closeTab = useWorkspace((s) => s.closeTab);
  const reorderTabs = useWorkspace((s) => s.reorderTabs);
  // tabsSig 仅作为重渲染触发器；实际渲染从 store 读取最新 openTabs
  void tabsSig;
  const openTabs = useWorkspace.getState().openTabs;

  // 右键菜单状态
  const [menu, setMenu] = useState<{ tab: OpenTab; x: number; y: number } | null>(null);
  // 拖拽状态：正在拖拽的 tab path，以及拖拽悬停的目标 path
  const [dragPath, setDragPath] = useState<string | null>(null);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);

  if (openTabs.length === 0) return null;

  const handleClose = (tab: OpenTab) => {
    if (tab.dirty) {
      const ok = window.confirm(
        `「${tabLabel(tab)}」有未保存的修改，确定关闭吗？`,
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
              <span className="tab-name">{tabLabel(tab)}</span>
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
