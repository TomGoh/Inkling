// 编辑器顶栏：文件名、保存指示器、源码模式/禅模式/侧边栏开关、
// 导出与主题下拉菜单（两者互斥展开）、快捷键与设置入口。
import { useState } from "react";
import type { Editor } from "@milkdown/kit/core";
import { SaveIndicator } from "./SaveIndicator";
import { ExportMenu } from "./ExportMenu";
import { ThemeMenu } from "./ThemeMenu";
import {
  IconMaximize,
  IconPanelLeft,
  IconSettings,
  IconHelpCircle,
  IconCode,
} from "../icons";

interface EditorTopbarProps {
  currentFile: string;
  sourceMode: boolean;
  onToggleSourceMode: () => void;
  onToggleZenMode: () => void;
  onToggleSidebar: () => void;
  onOpenShortcuts: () => void;
  onOpenSettings: () => void;
  getEditor: () => Editor | undefined;
}

export function EditorTopbar({
  currentFile,
  sourceMode,
  onToggleSourceMode,
  onToggleZenMode,
  onToggleSidebar,
  onOpenShortcuts,
  onOpenSettings,
  getEditor,
}: EditorTopbarProps) {
  // 导出菜单展开状态
  const [exportOpen, setExportOpen] = useState(false);
  // 主题菜单展开状态
  const [themeOpen, setThemeOpen] = useState(false);

  return (
    <div className="editor-topbar">
      <span
        className="topbar-file"
        title={
          currentFile.startsWith("untitled-")
            ? "未命名草稿（Ctrl+S 另存为）"
            : currentFile
        }
      >
        {currentFile.startsWith("untitled-")
          ? "未命名"
          : currentFile.split(/[\\/]/).pop()}
      </span>
      <div className="topbar-actions">
        <SaveIndicator />
        <button
          className={`topbar-btn${sourceMode ? " topbar-btn-active" : ""}`}
          onClick={onToggleSourceMode}
          title="源代码模式 (Ctrl/Cmd+Alt+S)"
          aria-pressed={sourceMode}
        >
          <IconCode />
        </button>
        <button className="topbar-btn" onClick={onToggleZenMode} title="禅模式 (F11)">
          <IconMaximize />
        </button>
        <button
          className="topbar-btn"
          onClick={onToggleSidebar}
          title="切换侧边栏 (Ctrl/Cmd+\)"
        >
          <IconPanelLeft />
        </button>
        <ExportMenu
          open={exportOpen}
          onOpenChange={(next) => {
            setExportOpen(next);
            if (next) setThemeOpen(false);
          }}
          getEditor={getEditor}
          sourceMode={sourceMode}
        />
        <ThemeMenu
          open={themeOpen}
          onOpenChange={(next) => {
            setThemeOpen(next);
            if (next) setExportOpen(false);
          }}
        />
        <button
          className="topbar-btn"
          onClick={onOpenShortcuts}
          title="快捷键 (Ctrl/Cmd+/)"
        >
          <IconHelpCircle />
        </button>
        <button
          className="topbar-btn"
          onClick={onOpenSettings}
          title="偏好设置 (Ctrl/Cmd+,)"
        >
          <IconSettings />
        </button>
      </div>
    </div>
  );
}
