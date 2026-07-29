import { MarkdownEditor } from "./components/Editor/Editor";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { useWorkspace } from "./store/workspace";
import "./App.css";

function App() {
  const currentFile = useWorkspace((s) => s.currentFile);
  const currentContent = useWorkspace((s) => s.currentContent);
  const setContent = useWorkspace((s) => s.setContent);

  return (
    <main className="app-shell">
      <Sidebar />
      <div className="editor-wrap">
        {currentFile ? (
          <MarkdownEditor value={currentContent} onChange={setContent} />
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
