import { useCallback, useRef, useState, useEffect } from "react";
import type { Editor } from "@milkdown/kit/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { EditorBody } from "./components/Editor/EditorBody";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { StatusBar } from "./components/StatusBar/StatusBar";
import { OutlinePanel } from "./components/Outline/OutlinePanel";
import { TabsBar } from "./components/Tabs/TabsBar";
import { SettingsPanel } from "./components/Settings/SettingsPanel";
import { ShortcutsHelp } from "./components/Shortcuts/ShortcutsHelp";
import { GlobalSearchPanel } from "./components/GlobalSearch/GlobalSearchPanel";
import { ConflictDialog } from "./components/FileConflict/ConflictDialog";
import { ShortcutsCustomize } from "./components/Shortcuts/ShortcutsCustomize";
import { EditorTopbar } from "./components/Topbar/EditorTopbar";
import { useWorkspace } from "./store/workspace";
import { useUI } from "./store/ui";
import { useSettings } from "./store/settings";
import { useAutoSave } from "./lib/useAutoSave";
import { useFileWatcher } from "./lib/useFileWatcher";
import { useCtrlWheelZoom } from "./lib/useCtrlWheelZoom";
import { useGlobalShortcuts } from "./lib/useGlobalShortcuts";
import { useStartupFile } from "./lib/useStartupFile";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { flushAllMarkdownPublishers } from "./components/Editor/markdown-publisher";
import { type EditorOutlineSnapshot } from "./lib/outline";
import { useOutline } from "./store/outline";
import { IconPanelLeft, IconFolder, IconFileText } from "./components/icons";
import "./App.css";

function App() {
  const currentFile = useWorkspace((s) => s.currentFile);
  // 分屏：右侧第二面板
  const splitFile = useWorkspace((s) => s.splitFile);
  const mainSourceMode = useWorkspace((s) => {
    if (!s.activeTabPath) return false;
    return s.openTabs.find((t) => t.path === s.activeTabPath)?.sourceMode ?? false;
  });
  const splitSourceMode = useWorkspace((s) => {
    if (!s.splitFile) return false;
    return s.openTabs.find((t) => t.path === s.splitFile)?.sourceMode ?? false;
  });
  const mainRevision = useWorkspace((s) => {
    if (!s.activeTabPath) return 0;
    return s.openTabs.find((t) => t.path === s.activeTabPath)?.revision ?? 0;
  });
  const splitRevision = useWorkspace((s) => {
    if (!s.splitFile) return 0;
    return s.openTabs.find((t) => t.path === s.splitFile)?.revision ?? 0;
  });
  // 分屏编辑器实例引用（独立于主编辑器）
  const splitEditorRef = useRef<(() => Editor | undefined) | null>(null);

  // 持有编辑器实例获取函数，供大纲面板与导出使用
  const getEditorRef = useRef<(() => Editor | undefined) | null>(null);
  // Ctrl+N 新建未命名草稿后，编辑器重建完成时自动聚焦
  const pendingFocusRef = useRef(false);
  const handleEditorReady = useCallback(
    (getEditor: (() => Editor | undefined) | null) => {
      getEditorRef.current = getEditor;
      if (getEditor && pendingFocusRef.current) {
        pendingFocusRef.current = false;
        const editor = getEditor();
        if (editor) {
          // 延迟一帧等编辑器挂载稳定
          requestAnimationFrame(() => {
            editor.action((ctx) => {
              ctx.get(editorViewCtx).focus();
            });
          });
        }
      }
    },
    [],
  );
  const handleSplitEditorReady = useCallback(
    (getEditor: (() => Editor | undefined) | null) => {
      splitEditorRef.current = getEditor;
    },
    [],
  );
  // 主编辑器发布的大纲快照直接写独立 store，仅 OutlinePanel 订阅：
  // 经 App useState 中转会导致滚动时整棵 App 树高频重渲染（issue #31）。
  const handleOutlineChange = useCallback(
    (snapshot: EditorOutlineSnapshot) => {
      useOutline
        .getState()
        .publish(useWorkspace.getState().currentFile, snapshot);
    },
    [],
  );

  // 偏好设置面板展开状态
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 查找替换面板展开状态
  const [searchOpen, setSearchOpen] = useState(false);
  // 查找面板是否显示替换框（受控，便于 Ctrl+R 直接展开替换）
  const [searchShowReplace, setSearchShowReplace] = useState(false);
  // 快捷键帮助面板展开状态
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // 全局搜索面板展开状态
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  // 快捷键自定义面板展开状态
  const [customizeOpen, setCustomizeOpen] = useState(false);

  // UI 可见性状态
  const sidebarVisible = useUI((s) => s.sidebarVisible);
  const outlineVisible = useUI((s) => s.outlineVisible);
  const toggleSidebar = useUI((s) => s.toggleSidebar);
  const zenMode = useUI((s) => s.zenMode);
  const toggleZenMode = useUI((s) => s.toggleZenMode);

  // 编辑器缩放倍率（Ctrl/Cmd + 滚轮调整，Ctrl/Cmd+0 重置）
  const editorZoom = useSettings((s) => s.editorZoom);

  // 进入源代码模式时关闭查找面板，避免对隐藏 WYSIWYG 的替换被丢弃
  useEffect(() => {
    if (mainSourceMode) {
      setSearchOpen(false);
      setSearchShowReplace(false);
    }
  }, [mainSourceMode]);

  // Ctrl/Cmd + 滚轮缩放文档：拦截浏览器原生页面缩放，改用应用内 zoom
  // 性能关键：仅在 Ctrl/Cmd 按下时才挂载 passive:false 监听器，
  // 普通滚动时无任何 wheel 监听器，让浏览器走合成线程快速滚动路径。
  // 万行文档下若 passive:false 常驻，主线程被布局/绘制占用时滚轮会严重卡顿。
  // 逻辑抽到 useCtrlWheelZoom hook 便于单元测试覆盖。
  useCtrlWheelZoom();

  // 启用 Ctrl/Cmd+S 手动保存 + 防抖 2 秒自动保存
  useAutoSave();
  // 启用外部文件修改监听（仅桌面端）
  useFileWatcher();
  // 启动时打开目标文件（派生窗口 / 文件关联 / 单实例转发）
  useStartupFile();

  // 窗口关闭 / 刷新时统一 flush 存活编辑器的待发变更，若有未保存文件在退出时落盘
  useEffect(() => {
    const handleBeforeUnload = () => {
      flushAllMarkdownPublishers();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    let disposed = false;
    let unlistenClose: (() => void) | undefined;
    if (isTauri()) {
      const win = getCurrentWindow();
      void win.onCloseRequested(async (event) => {
        event.preventDefault();
        flushAllMarkdownPublishers();
        const currentTabs = useWorkspace.getState().openTabs;
        const dirtyTabs = currentTabs.filter((t) => t.dirty);
        const originalActivePath = useWorkspace.getState().activeTabPath;
        if (dirtyTabs.length > 0) {
          // 遍历所有 dirty tabs，逐个切换并执行保存
          for (const tab of dirtyTabs) {
            try {
              useWorkspace.getState().switchTab(tab.path);
              await useWorkspace.getState().saveCurrent();
            } catch {
              // 捕获保存异常继续处理后续 tab
            }
          }
          // 重新检查是否仍有 dirty tab（如未命名取消保存/冲突拒绝覆盖/磁盘错误）
          const latestTabs = useWorkspace.getState().openTabs;
          const stillDirty = latestTabs.some((t) => t.dirty);
          if (stillDirty) {
            try {
              const { ask } = await import("@tauri-apps/plugin-dialog");
              const confirmed = await ask(
                "存在未保存的文档修改。退出将丢失这些修改，确定要退出吗？",
                { title: "退出确认", kind: "warning" },
              );
              if (!confirmed) {
                // 用户取消退出留在应用时，恢复到原先的 activeTab
                if (originalActivePath) {
                  useWorkspace.getState().switchTab(originalActivePath);
                }
                return;
              }
            } catch {
              // 弹窗失败采用 fail-safe 策略：不强制销毁窗口，保护用户数据
              if (originalActivePath) {
                useWorkspace.getState().switchTab(originalActivePath);
              }
              return;
            }
          }
        }
        await win.destroy();
      }).then((fn) => {
        if (disposed) {
          fn();
        } else {
          unlistenClose = fn;
        }
      });
    }

    return () => {
      disposed = true;
      window.removeEventListener("beforeunload", handleBeforeUnload);
      unlistenClose?.();
    };
  }, []);

  // 稳定引用：避免 OutlinePanel 列表项 memo 因 getEditor 身份变化失效
  const getEditor = useCallback(() => getEditorRef.current?.(), []);

  // 全局快捷键（自定义绑定经 useShortcuts store 生效）
  useGlobalShortcuts({
    onNewTab: () => {
      pendingFocusRef.current = true;
      useWorkspace.getState().newTab();
    },
    openGlobalSearch: () => setGlobalSearchOpen(true),
    openFindPanel: (showReplace) => {
      setSearchShowReplace(showReplace);
      setSearchOpen(true);
    },
    toggleShortcutsHelp: () => setShortcutsOpen((v) => !v),
    openSettings: () => setSettingsOpen(true),
    getEditor,
  });

  // 禅模式：仅渲染编辑器，隐藏所有 UI（侧边栏/大纲/标签页/工具栏/状态栏）
  if (zenMode && currentFile) {
    return (
      <main className="app-shell zen-mode">
        <div className="editor-wrap">
          <EditorBody
            currentFile={currentFile}
            mainRevision={mainRevision}
            mainSourceMode={mainSourceMode}
            splitFile={null}
            splitSourceMode={false}
            splitRevision={0}
            editorZoom={editorZoom}
            searchOpen={false}
            searchShowReplace={false}
            getEditor={getEditor}
            setSearchOpen={setSearchOpen}
            setSearchShowReplace={setSearchShowReplace}
            onEditorReady={handleEditorReady}
            onOutlineChange={handleOutlineChange}
            onSplitEditorReady={handleSplitEditorReady}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="app-main">
      {sidebarVisible && <Sidebar />}
      <div className="editor-wrap">
        {currentFile ? (
          <>
            <TabsBar />
            <EditorTopbar
              currentFile={currentFile}
              sourceMode={mainSourceMode}
              onToggleSourceMode={() => useWorkspace.getState().toggleTabSourceMode()}
              onToggleZenMode={toggleZenMode}
              onToggleSidebar={toggleSidebar}
              onOpenShortcuts={() => setShortcutsOpen(true)}
              onOpenSettings={() => setSettingsOpen(true)}
              getEditor={getEditor}
            />
            <EditorBody
              currentFile={currentFile}
              mainRevision={mainRevision}
              mainSourceMode={mainSourceMode}
              splitFile={splitFile}
              splitSourceMode={splitSourceMode}
              splitRevision={splitRevision}
              editorZoom={editorZoom}
              searchOpen={searchOpen}
              searchShowReplace={searchShowReplace}
              getEditor={getEditor}
              setSearchOpen={setSearchOpen}
              setSearchShowReplace={setSearchShowReplace}
              onEditorReady={handleEditorReady}
              onOutlineChange={handleOutlineChange}
              onSplitEditorReady={handleSplitEditorReady}
            />
          </>
        ) : (
          <div className="empty-state">
            <h2>InklingMD</h2>
            <p>从左侧侧边栏打开文件夹，或打开单个 Markdown 文件开始编辑</p>
            <div className="empty-state-actions">
              <button
                className="empty-state-btn primary"
                onClick={async () => {
                  try {
                    const selected = await (window as unknown as { __TAURI__?: { dialog?: { open?: (opts: unknown) => Promise<string | null> } } }).__TAURI__?.dialog?.open?.({ directory: true, multiple: false });
                    if (typeof selected === "string") {
                      useWorkspace.getState().openWorkspace(selected);
                    }
                  } catch {
                    // ignore
                  }
                }}
              >
                <IconFolder size={16} />
                打开文件夹
              </button>
              <button
                className="empty-state-btn secondary"
                onClick={async () => {
                  try {
                    const selected = await (window as unknown as { __TAURI__?: { dialog?: { open?: (opts: unknown) => Promise<string | null> } } }).__TAURI__?.dialog?.open?.({
                      directory: false,
                      multiple: false,
                      filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }],
                    });
                    if (typeof selected === "string") {
                      useWorkspace.getState().openFileStandalone(selected);
                    }
                  } catch {
                    // ignore
                  }
                }}
              >
                <IconFileText size={16} />
                打开文件
              </button>
              {!sidebarVisible && (
                <button
                  className="empty-state-btn secondary"
                  onClick={toggleSidebar}
                  title="打开侧边栏 (Ctrl/Cmd+\)"
                >
                  <IconPanelLeft size={16} />
                  打开侧边栏
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {currentFile && outlineVisible && <OutlinePanel getEditor={getEditor} />}
      </div>
      {currentFile && <StatusBar />}
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {shortcutsOpen && (
        <ShortcutsHelp
          onClose={() => setShortcutsOpen(false)}
          onCustomize={() => {
            setShortcutsOpen(false);
            setCustomizeOpen(true);
          }}
        />
      )}
      {customizeOpen && (
        <ShortcutsCustomize onClose={() => setCustomizeOpen(false)} />
      )}
      {globalSearchOpen && (
        <GlobalSearchPanel
          getEditor={getEditor}
          onClose={() => setGlobalSearchOpen(false)}
        />
      )}
      <ConflictDialog />
    </main>
  );
}

export default App;
