import { useRef, useState, useEffect } from "react";
import type { Editor } from "@milkdown/kit/core";
import { MarkdownEditor } from "./components/Editor/Editor";
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
import { exportHTML, exportPDF, exportDocx, copyMarkdown, copyRichText } from "./lib/exporter";
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

  // 持有编辑器实例获取函数，供大纲面板与导出使用
  const getEditorRef = useRef<(() => Editor | undefined) | null>(null);

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

  // 禅模式：仅渲染编辑器，隐藏所有 UI（侧边栏/大纲/标签页/工具栏/状态栏）
  if (zenMode && currentFile) {
    return (
      <main className="app-shell zen-mode">
        <div className="editor-wrap">
          <div className="editor-scroll">
            <EditorErrorBoundary fileName={currentFile}>
              <MarkdownEditor
                value={currentContent}
                onChange={setContent}
                onReady={(getEditor) => (getEditorRef.current = getEditor)}
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
              <span className="topbar-file" title={currentFile}>
                {currentFile.split(/[\\/]/).pop()}
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
            <div className="editor-scroll">
              {searchOpen && (
                <SearchPanel
                  getEditor={getEditor}
                  onClose={() => setSearchOpen(false)}
                />
              )}
              <EditorErrorBoundary fileName={currentFile}>
                <MarkdownEditor
                  value={currentContent}
                  onChange={setContent}
                  onReady={(getEditor) => (getEditorRef.current = getEditor)}
                />
              </EditorErrorBoundary>
            </div>
            <StatusBar />
          </>
        ) : (
          <div className="empty-state">
            <h2>Inkling</h2>
            <p>从左侧侧边栏「打开」文件夹，选择一个 .md 文件开始编辑</p>
          </div>
        )}
      </div>
      {currentFile && outlineVisible && (
        <OutlinePanel getEditor={getEditor} />
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
