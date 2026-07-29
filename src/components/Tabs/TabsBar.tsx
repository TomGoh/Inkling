// 多标签页栏
// 类似 VSCode：每个打开的文件一个 tab，点击切换、中键/×关闭。
// 关闭未保存文件时弹出确认，避免数据丢失。

import { useWorkspace, type OpenTab } from "../../store/workspace";
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
          return (
            <div
              key={tab.path}
              className={`tab${active ? " tab-active" : ""}`}
              title={tab.path}
              onClick={() => switchTab(tab.path)}
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
    </div>
  );
}

export default TabsBar;
