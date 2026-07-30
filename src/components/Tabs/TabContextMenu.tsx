// 标签页右键菜单
// 在标签页上右键时弹出：关闭/关闭其他/关闭右侧/全部关闭/复制路径
// 关闭未保存文件时弹确认，避免数据丢失

import { useEffect, useRef } from "react";
import { useWorkspace, type OpenTab } from "../../store/workspace";
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

  /** 关闭单个，未保存时确认 */
  const handleClose = (t: OpenTab) => {
    if (t.dirty) {
      const ok = window.confirm(
        `「${baseName(t.path)}」有未保存的修改，确定关闭吗？`,
      );
      if (!ok) return;
    }
    closeTab(t.path);
    onClose();
  };

  /** 关闭其他，未保存的逐个确认 */
  const handleCloseOthers = () => {
    const others = openTabs.filter((t) => t.path !== tab.path);
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
    const idx = openTabs.findIndex((t) => t.path === tab.path);
    const rights = openTabs.slice(idx + 1);
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
    for (const t of openTabs) {
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

  const idx = openTabs.findIndex((t) => t.path === tab.path);
  const hasRight = idx < openTabs.length - 1;

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
        <button className="tab-context-item" onClick={handleCopyPath}>
          复制路径
        </button>
      </div>
    </div>
  );
}

export default TabContextMenu;
