// 标签页右键菜单
// 在标签页上右键时弹出：关闭/关闭其他/关闭右侧/全部关闭/复制路径
// 关闭未保存文件时弹确认，避免数据丢失

import { useEffect } from "react";
import { useWorkspace, type OpenTab } from "../../store/workspace";
import { flushAllMarkdownPublishers } from "../Editor/markdown-publisher";
import { openInNewWindow } from "../../lib/newWindow";
import { useContextMenuClamping } from "../../hooks/useContextMenuClamping";
import "./TabContextMenu.css";

interface TabContextMenuProps {
  /** 右键的目标 tab */
  tab: OpenTab;
  /** 菜单屏幕坐标 */
  x: number;
  y: number;
  onClose: () => void;
}

/** 取文件名（去目录路径） */
function baseName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export function TabContextMenu({ tab, x, y, onClose }: TabContextMenuProps) {
  const closeTab = useWorkspace((s) => s.closeTab);
  const closeOthers = useWorkspace((s) => s.closeOthers);
  const closeToRight = useWorkspace((s) => s.closeToRight);
  const closeAll = useWorkspace((s) => s.closeAll);
  const openTabs = useWorkspace((s) => s.openTabs);
  const splitOpen = useWorkspace((s) => s.splitOpen);
  const splitFile = useWorkspace((s) => s.splitFile);
  const currentFile = useWorkspace((s) => s.currentFile);

  const ref = useContextMenuClamping<HTMLDivElement>({ x, y });

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

  /** 关闭前先 flush 防抖窗口内的发布并读取最新 tab 状态，
   *  否则窗口内关闭会静默丢弃未发布编辑（PR #34） */
  const freshTabs = () => {
    flushAllMarkdownPublishers();
    return useWorkspace.getState().openTabs;
  };

  /** 关闭单个，未保存时确认 */
  const handleClose = (t: OpenTab) => {
    const fresh = freshTabs().find((x) => x.path === t.path) ?? t;
    if (fresh.dirty) {
      const ok = window.confirm(
        `「${baseName(fresh.path)}」有未保存的修改，确定关闭吗？`,
      );
      if (!ok) return;
    }
    closeTab(fresh.path);
    onClose();
  };

  /** 关闭其他，未保存的逐个确认 */
  const handleCloseOthers = () => {
    const tabs = freshTabs();
    const others = tabs.filter((t) => t.path !== tab.path);
    for (const t of others) {
      if (t.dirty) {
        const ok = window.confirm(
          `「${baseName(t.path)}」有未保存的修改，确定关闭吗？`,
        );
        if (!ok) return;
      }
    }
    closeOthers(tab.path);
    onClose();
  };

  /** 关闭右侧，未保存的逐个确认 */
  const handleCloseToRight = () => {
    const tabs = freshTabs();
    const idx = tabs.findIndex((t) => t.path === tab.path);
    const rights = tabs.slice(idx + 1);
    for (const t of rights) {
      if (t.dirty) {
        const ok = window.confirm(
          `「${baseName(t.path)}」有未保存的修改，确定关闭吗？`,
        );
        if (!ok) return;
      }
    }
    closeToRight(tab.path);
    onClose();
  };

  /** 关闭全部，未保存的逐个确认 */
  const handleCloseAll = () => {
    for (const t of freshTabs()) {
      if (t.dirty) {
        const ok = window.confirm(
          `「${baseName(t.path)}」有未保存的修改，确定关闭吗？`,
        );
        if (!ok) return;
      }
    }
    closeAll();
    onClose();
  };

  /** 复制文件路径到剪贴板 */
  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(tab.path);
    } catch {
      // 忽略剪贴板权限失败
    }
    onClose();
  };

  /** 在分屏面板打开此 tab 作为对照 */
  const handleSplitOpen = () => {
    // 不允许把当前主文件再分屏（无对照意义）
    if (tab.path === currentFile) {
      onClose();
      return;
    }
    void splitOpen(tab.path);
    onClose();
  };

  /** 在新窗口打开此文件（桌面端创建独立窗口；浏览器回退忽略） */
  const handleOpenInNewWindow = async () => {
    const ok = await openInNewWindow(tab.path);
    if (!ok) {
      // 浏览器端无多窗口能力，提示用户
      alert("多窗口仅在桌面端可用");
    }
    onClose();
  };

  const idx = openTabs.findIndex((t) => t.path === tab.path);
  const hasRight = idx < openTabs.length - 1;
  // 分屏菜单项可用性：当前主文件不可分屏；若已分屏且分屏的就是此 tab，则禁用
  const canSplit = tab.path !== currentFile && splitFile !== tab.path;

  // 计算菜单位置，避免溢出视口
  const style: React.CSSProperties = {
    left: x,
    top: y,
  };

  return (
    <div className="tab-context-backdrop">
      <div
        ref={ref}
        className="tab-context-menu"
        style={style}
        role="menu"
      >
        <button className="tab-context-item" onClick={() => handleClose(tab)}>
          关闭
        </button>
        <button
          className="tab-context-item"
          onClick={handleCloseOthers}
          disabled={openTabs.length <= 1}
        >
          关闭其他
        </button>
        <button
          className="tab-context-item"
          onClick={handleCloseToRight}
          disabled={!hasRight}
        >
          关闭右侧
        </button>
        <button className="tab-context-item" onClick={handleCloseAll}>
          全部关闭
        </button>
        <div className="tab-context-sep" />
        <button
          className="tab-context-item"
          onClick={handleSplitOpen}
          disabled={!canSplit}
          title={canSplit ? "在右侧分屏面板打开此文件作为对照" : "当前主文件或已在分屏中"}
        >
          在分屏打开
        </button>
        <button
          className="tab-context-item"
          onClick={() => void handleOpenInNewWindow()}
        >
          在新窗口打开
        </button>
        <button className="tab-context-item" onClick={handleCopyPath}>
          复制路径
        </button>
      </div>
    </div>
  );
}

export default TabContextMenu;
