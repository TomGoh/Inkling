import { useCallback, useRef, useState, useEffect } from "react";
import type { Editor } from "@milkdown/kit/core";
import { MarkdownEditor } from "./components/Editor/Editor";
import { TableToolbar } from "./components/Editor/TableToolbar";
import { SearchPanel } from "./components/Editor/SearchPanel";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { StatusBar } from "./components/StatusBar/StatusBar";
import { OutlinePanel } from "./components/Outline/OutlinePanel";
import { TabsBar } from "./components/Tabs/TabsBar";
import { SettingsPanel } from "./components/Settings/SettingsPanel";
import { ShortcutsHelp } from "./components/Shortcuts/ShortcutsHelp";
import { GlobalSearchPanel } from "./components/GlobalSearch/GlobalSearchPanel";
import { EditorErrorBoundary } from "./components/Editor/EditorErrorBoundary";
import { ShortcutsCustomize } from "./components/Shortcuts/ShortcutsCustomize";
import { useWorkspace } from "./store/workspace";
import { useTheme } from "./store/theme";
import { useUI } from "./store/ui";
import { useShortcuts, matchBinding, type ShortcutId } from "./store/shortcuts";
import { useAutoSave } from "./lib/useAutoSave";
import { useFileWatcher } from "./lib/useFileWatcher";
import { exportHTML, exportPDF, exportDocx, exportPNG, exportOutline, copyMarkdown, copyRichText } from "./lib/exporter";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getNewWindowFilePath } from "./lib/newWindow";
import {
  EMPTY_EDITOR_OUTLINE,
  type EditorOutlineSnapshot,
} from "./lib/outline";
import "./App.css";

function SaveIndicator() {
  const dirty = useWorkspace((s) => s.dirty);
  const saving = useWorkspace((s) => s.saving);
  const saveError = useWorkspace((s) => s.saveError);
  const lastSavedAt = useWorkspace((s) => s.lastSavedAt);

  if (saveError) {
    return <span className="save-indicator save-error">保存失败：{saveError}</span>;
  }
  if (saving) return <span className="save-indicator">保存中…</span>;
  if (dirty) return <span className="save-indicator">未保存</span>;
  if (lastSavedAt) {
    const t = new Date(lastSavedAt).toLocaleTimeString();
    return <span className="save-indicator save-ok">已保存 {t}</span>;
  }
  return <span className="save-indicator" />;
}

function App() {
  const currentFile = useWorkspace((s) => s.currentFile);
  const currentContent = useWorkspace((s) => s.currentContent);
  const setContent = useWorkspace((s) => s.setContent);
  // 分屏：右侧第二面板
  const splitFile = useWorkspace((s) => s.splitFile);
  const splitContent = useWorkspace((s) => s.splitContent);
  const setSplitContent = useWorkspace((s) => s.setSplitContent);
  const splitClose = useWorkspace((s) => s.splitClose);
  const splitSwap = useWorkspace((s) => s.splitSwap);
  // 分屏编辑器实例引用（独立于主编辑器）
  const splitEditorRef = useRef<(() => Editor | undefined) | null>(null);

  // 持有编辑器实例获取函数，供大纲面板与导出使用
  const getEditorRef = useRef<(() => Editor | undefined) | null>(null);
  const [mainEditorReady, setMainEditorReady] = useState(false);
  // 主编辑器光标是否在表格内（驱动工具栏的表格上下文按钮组）
  const [mainInTable, setMainInTable] = useState(false);
  const handleEditorReady = useCallback(
    (getEditor: (() => Editor | undefined) | null) => {
      getEditorRef.current = getEditor;
      setMainEditorReady(getEditor !== null);
    },
    [],
  );
  const handleSplitEditorReady = useCallback(
    (getEditor: (() => Editor | undefined) | null) => {
      splitEditorRef.current = getEditor;
    },
    [],
  );
  // 主编辑器发布的大纲快照；记录文件以避免切换时短暂显示旧大纲。
  const [outlineState, setOutlineState] = useState<{
    file: string | null;
    snapshot: EditorOutlineSnapshot;
  }>({ file: null, snapshot: EMPTY_EDITOR_OUTLINE });
  const handleOutlineChange = useCallback(
    (snapshot: EditorOutlineSnapshot) => {
      setOutlineState({
        file: useWorkspace.getState().currentFile,
        snapshot,
      });
    },
    [],
  );

  // 导出菜单展开状态
  const [exportOpen, setExportOpen] = useState(false);
  // 主题菜单展开状态
  const [themeOpen, setThemeOpen] = useState(false);
  // 偏好设置面板展开状态
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 查找替换面板展开状态
  const [searchOpen, setSearchOpen] = useState(false);
  // 快捷键帮助面板展开状态
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // 全局搜索面板展开状态
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  // 快捷键自定义面板展开状态
  const [customizeOpen, setCustomizeOpen] = useState(false);

  // 主题状态
  const themeMode = useTheme((s) => s.mode);
  const setThemeMode = useTheme((s) => s.setMode);
  const loadCustomCSS = useTheme((s) => s.loadCustomCSS);
  const clearCustomCSS = useTheme((s) => s.clearCustomCSS);
  const customCSSPath = useTheme((s) => s.customCSSPath);

  // UI 可见性状态
  const sidebarVisible = useUI((s) => s.sidebarVisible);
  const outlineVisible = useUI((s) => s.outlineVisible);
  const toggleSidebar = useUI((s) => s.toggleSidebar);
  const toggleOutline = useUI((s) => s.toggleOutline);
  const zenMode = useUI((s) => s.zenMode);
  const toggleZenMode = useUI((s) => s.toggleZenMode);
  const setZenMode = useUI((s) => s.setZenMode);

  // 启用 Ctrl/Cmd+S 手动保存 + 防抖 2 秒自动保存
  useAutoSave();
  // 启用外部文件修改监听（仅桌面端）
  useFileWatcher();

  // 启动时打开目标文件，三种来源：
  // 1. 多窗口派生：URL 查询参数 inklingFile（由「在新窗口打开」创建的窗口）
  // 2. 文件关联双击（首次启动）：Rust 端从 argv 提取，前端就绪后 take_pending_file 拉取
  // 3. 单实例转发（程序已运行时双击 .md）：Rust 端 emit open-file 事件，定向到主窗口
  useEffect(() => {
    if (!isTauri()) return;
    const open = useWorkspace.getState().openFileStandalone;

    // 派生窗口只处理自身的派生目标，不参与 pending / 单实例（避免与主窗口重复打开）
    const winTarget = getNewWindowFilePath();
    if (winTarget) {
      void open(winTarget);
      return;
    }

    // 主窗口：拉取首次启动的待打开文件
    let cancelled = false;
    invoke<string | null>("take_pending_file").then((p) => {
      if (!cancelled && p) void open(p);
    });

    // 主窗口：监听单实例转发的双击打开事件
    const unlisten = listen<string>("open-file", (e) => {
      if (!cancelled) void open(e.payload);
    });

    return () => {
      cancelled = true;
      void unlisten.then((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 全局快捷键：通过 useShortcuts store 读取用户自定义绑定
  // 编辑器内 Milkdown 预设的快捷键（加粗等）不在自定义范围
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // F11 切换禅模式（非修饰键，独立处理）
      if (e.key === "F11") {
        e.preventDefault();
        toggleZenMode();
        return;
      }
      // 禅模式下 Esc 退出
      if (e.key === "Escape" && useUI.getState().zenMode) {
        setZenMode(false);
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      // Ctrl/Cmd+N 新建未命名草稿（不关联磁盘文件，Ctrl+S 时另存为）
      if (!e.shiftKey && !e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        useWorkspace.getState().newTab();
        return;
      }
      // Ctrl/Cmd+Shift+F 全局搜索（优先于当前文件查找）
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setGlobalSearchOpen(true);
        return;
      }
      const store = useShortcuts.getState();
      const tryMatch = (id: ShortcutId) => matchBinding(store.getBinding(id), e);
      if (tryMatch("find")) {
        e.preventDefault();
        setSearchOpen(true);
      } else if (tryMatch("toggleSidebar")) {
        e.preventDefault();
        toggleSidebar();
      } else if (tryMatch("toggleOutline")) {
        e.preventDefault();
        toggleOutline();
      } else if (tryMatch("showShortcuts")) {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      } else if (tryMatch("openSettings")) {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleSidebar, toggleOutline, toggleZenMode, setZenMode]);

  const getEditor = () => getEditorRef.current?.();
  const outlineSnapshot =
    mainEditorReady && outlineState.file === currentFile
      ? outlineState.snapshot
      : EMPTY_EDITOR_OUTLINE;

  // 禅模式：仅渲染编辑器，隐藏所有 UI（侧边栏/大纲/标签页/工具栏/状态栏）
  if (zenMode && currentFile) {
    return (
      <main className="app-shell zen-mode">
        <div className="editor-wrap">
          <div className="editor-scroll">
            <EditorErrorBoundary fileName={currentFile}>
              <MarkdownEditor
                key={currentFile}
                filePath={currentFile}
                value={currentContent}
                onChange={setContent}
                onReady={handleEditorReady}
                onOutlineChange={handleOutlineChange}
              />
            </EditorErrorBoundary>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      {sidebarVisible && <Sidebar />}
      <div className="editor-wrap">
        {currentFile ? (
          <>
            <TabsBar />
            <div className="editor-topbar">
              <span className="topbar-file" title={currentFile.startsWith("untitled-") ? "未命名草稿（Ctrl+S 另存为）" : currentFile}>
                {currentFile.startsWith("untitled-") ? "未命名" : currentFile.split(/[\\/]/).pop()}
              </span>
              <div className="topbar-actions">
                <SaveIndicator />
                <button
                  className="topbar-btn"
                  onClick={toggleZenMode}
                  title="禅模式 (F11)"
                >
                  ⛶
                </button>
                <button
                  className="topbar-btn"
                  onClick={toggleSidebar}
                  title="切换侧边栏 (Ctrl/Cmd+\\)"
                >
                  ▣
                </button>
                <div className="export-menu">
                  <button
                    className="topbar-btn"
                    onClick={() => {
                      setExportOpen((v) => !v);
                      setThemeOpen(false);
                    }}
                    title="导出"
                  >
                    导出 ▾
                  </button>
                  {exportOpen && (
                    <>
                      <div
                        className="export-backdrop"
                        onClick={() => setExportOpen(false)}
                      />
                      <div className="export-dropdown">
                        <button
                          className="export-item"
                          onClick={() => {
                            setExportOpen(false);
                            void copyRichText(getEditor).then((ok) => {
                              if (!ok) alert("复制失败，请检查浏览器剪贴板权限");
                            });
                          }}
                        >
                          复制为富文本
                        </button>
                        <button
                          className="export-item"
                          onClick={() => {
                            setExportOpen(false);
                            void copyMarkdown().then((ok) => {
                              if (!ok) alert("复制失败，请检查浏览器剪贴板权限");
                            });
                          }}
                        >
                          复制为 Markdown
                        </button>
                        <div className="export-sep" />
                        <button
                          className="export-item"
                          onClick={() => {
                            setExportOpen(false);
                            void exportHTML(getEditor);
                          }}
                        >
                          导出 HTML
                        </button>
                        <button
                          className="export-item"
                          onClick={() => {
                            setExportOpen(false);
                            void exportDocx().then((r) => {
                              if (!r.ok && r.error) alert(r.error);
                            });
                          }}
                        >
                          导出 Word（.docx，Pandoc）
                        </button>
                        <button
                          className="export-item"
                          onClick={() => {
                            setExportOpen(false);
                            void exportPDF(getEditor);
                          }}
                        >
                          导出 PDF（打印）
                        </button>
                        <button
                          className="export-item"
                          onClick={() => {
                            setExportOpen(false);
                            void exportPNG(getEditor);
                          }}
                        >
                          导出长图（PNG）
                        </button>
                        <button
                          className="export-item"
                          onClick={() => {
                            setExportOpen(false);
                            void exportOutline();
                          }}
                        >
                          导出大纲（仅标题）
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <div className="export-menu">
                  <button
                    className="topbar-btn"
                    onClick={() => {
                      setThemeOpen((v) => !v);
                      setExportOpen(false);
                    }}
                    title="主题"
                  >
                    {themeMode === "dark" ? "🌙 深色" : "☀️ 浅色"} ▾
                  </button>
                  {themeOpen && (
                    <>
                      <div
                        className="export-backdrop"
                        onClick={() => setThemeOpen(false)}
                      />
                      <div className="export-dropdown">
                        <button
                          className={`export-item${themeMode === "light" ? " export-item-active" : ""}`}
                          onClick={() => {
                            setThemeMode("light");
                            setThemeOpen(false);
                          }}
                        >
                          ☀️ 浅色
                        </button>
                        <button
                          className={`export-item${themeMode === "dark" ? " export-item-active" : ""}`}
                          onClick={() => {
                            setThemeMode("dark");
                            setThemeOpen(false);
                          }}
                        >
                          🌙 深色
                        </button>
                        <div className="export-sep" />
                        <button
                          className="export-item"
                          onClick={() => {
                            setThemeOpen(false);
                            void loadCustomCSS();
                          }}
                        >
                          📄 加载自定义 CSS…
                        </button>
                        {customCSSPath && (
                          <button
                            className="export-item export-item-muted"
                            onClick={() => {
                              clearCustomCSS();
                              setThemeOpen(false);
                            }}
                          >
                            ✕ 清除自定义 CSS
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <button
                  className="topbar-btn"
                  onClick={() => setShortcutsOpen(true)}
                  title="快捷键 (Ctrl/Cmd+/)"
                >
                  ?
                </button>
                <button
                  className="topbar-btn"
                  onClick={() => setSettingsOpen(true)}
                  title="偏好设置 (Ctrl/Cmd+,)"
                >
                  ⚙
                </button>
              </div>
            </div>
            <TableToolbar getEditor={getEditor} inTable={mainInTable} />
            <div className={`editor-body${splitFile ? " editor-body-split" : ""}`}>
              <div className="editor-scroll">
                {searchOpen && (
                  <SearchPanel
                    getEditor={getEditor}
                    onClose={() => setSearchOpen(false)}
                  />
                )}
                <EditorErrorBoundary fileName={currentFile}>
                  <MarkdownEditor
                    key={currentFile}
                    filePath={currentFile}
                    value={currentContent}
                    onChange={setContent}
                    onReady={handleEditorReady}
                    onOutlineChange={handleOutlineChange}
                    onInTableChange={setMainInTable}
                  />
                </EditorErrorBoundary>
              </div>
              {splitFile && (
                <div className="split-pane">
                  <div className="split-pane-header">
                    <span className="topbar-file" title={splitFile}>
                      {splitFile.split(/[\\/]/).pop()}
                    </span>
                    <div className="topbar-actions">
                      <button
                        className="topbar-btn"
                        onClick={splitSwap}
                        title="左右交换"
                      >
                        ⇄
                      </button>
                      <button
                        className="topbar-btn"
                        onClick={splitClose}
                        title="关闭分屏"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <div className="editor-scroll editor-scroll-split-pane">
                    <EditorErrorBoundary fileName={splitFile}>
                      <MarkdownEditor
                        key={splitFile}
                        filePath={splitFile}
                        value={splitContent}
                        onChange={setSplitContent}
                        onReady={handleSplitEditorReady}
                      />
                    </EditorErrorBoundary>
                  </div>
                </div>
              )}
            </div>
            <StatusBar />
          </>
        ) : (
          <div className="empty-state">
            <h2>InklingMD</h2>
            <p>从左侧侧边栏「打开」文件夹，或「打开文件」直接打开一个 .md 开始编辑</p>
            {!sidebarVisible && (
              <button
                className="empty-state-open-sidebar"
                onClick={toggleSidebar}
                title="打开侧边栏 (Ctrl/Cmd+\)"
              >
                ▣ 打开侧边栏
              </button>
            )}
          </div>
        )}
      </div>
      {currentFile && outlineVisible && (
        <OutlinePanel
          getEditor={getEditor}
          snapshot={outlineSnapshot}
        />
      )}
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
    </main>
  );
}

export default App;
