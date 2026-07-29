import { useState } from "react";
import { MarkdownEditor } from "./components/Editor/Editor";
import "./App.css";

const DEFAULT_CONTENT = `# 欢迎使用 Inkling

一个所见即所得的 Markdown 编辑器。

## 基础语法

**加粗**、*斜体*、\`行内代码\`。

- 无序列表项一
- 无序列表项二

1. 有序列表项一
2. 有序列表项二

> 引用块示例

---

输入 \`---\` 后回车可生成分割线。试试在这里继续编辑。
`;

function App() {
  const [content, setContent] = useState(DEFAULT_CONTENT);

  return (
    <main className="app-shell">
      <div className="editor-wrap">
        <MarkdownEditor value={content} onChange={setContent} />
      </div>
    </main>
  );
}

export default App;
