import { useRef, useState } from "react";
import type { Editor } from "@milkdown/kit/core";
import { MarkdownEditor } from "./components/Editor/Editor";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { StatusBar } from "./components/StatusBar/StatusBar";
import { OutlinePanel } from "./components/Outline/OutlinePanel";
import { useWorkspace } from "./store/workspace";
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
                    onClick={() => setExportOpen((v) => !v)}
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
