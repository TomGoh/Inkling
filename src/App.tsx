import { MarkdownEditor } from "./components/Editor/Editor";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { useWorkspace } from "./store/workspace";
import { useAutoSave } from "./lib/useAutoSave";
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

  // 启用 Ctrl/Cmd+S 手动保存 + 防抖 2 秒自动保存
  useAutoSave();

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
              <SaveIndicator />
            </div>
            <div className="editor-scroll">
              <MarkdownEditor value={currentContent} onChange={setContent} />
            </div>
          </>
        ) : (
          <div className="empty-state">
            <h2>Inkling</h2>
            <p>从左侧侧边栏「打开」文件夹，选择一个 .md 文件开始编辑</p>
          </div>
        )}
      </div>
    </main>
  );
}

export default App;
