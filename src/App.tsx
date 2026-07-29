import { useRef, useState } from "react";
import type { Editor } from "@milkdown/kit/core";
import { MarkdownEditor } from "./components/Editor/Editor";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { StatusBar } from "./components/StatusBar/StatusBar";
import { OutlinePanel } from "./components/Outline/OutlinePanel";
import { useWorkspace } from "./store/workspace";
import { useTheme } from "./store/theme";
import { useAutoSave } from "./lib/useAutoSave";
import { exportHTML, exportPDF } from "./lib/exporter";
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

  // 主题状态
  const themeMode = useTheme((s) => s.mode);
  const setThemeMode = useTheme((s) => s.setMode);
  const loadCustomCSS = useTheme((s) => s.loadCustomCSS);
  const clearCustomCSS = useTheme((s) => s.clearCustomCSS);
  const customCSSPath = useTheme((s) => s.customCSSPath);

  // 启用 Ctrl/Cmd+S 手动保存 + 防抖 2 秒自动保存
  useAutoSave();

  const getEditor = () => getEditorRef.current?.();

  return (
    <main className="app-shell">
      <Sidebar />
      <div className="editor-wrap">
        {currentFile ? (
          <>
            <div className="editor-topbar">
              <span className="topbar-file" title={currentFile}>
                {currentFile.split(/[\\/]/).pop()}
              </span>
              <div className="topbar-actions">
                <SaveIndicator />
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
                            void exportHTML(getEditor);
                          }}
                        >
                          导出 HTML
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
              </div>
            </div>
            <div className="editor-scroll">
              <MarkdownEditor
                value={currentContent}
                onChange={setContent}
                onReady={(getEditor) => (getEditorRef.current = getEditor)}
              />
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
      {currentFile && <OutlinePanel getEditor={getEditor} />}
    </main>
  );
}

export default App;
