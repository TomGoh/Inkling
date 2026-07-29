import { useMemo } from "react";
import { useWorkspace } from "../../store/workspace";
import { countStats } from "../../lib/stats";
import "./StatusBar.css";

export function StatusBar() {
  const currentFile = useWorkspace((s) => s.currentFile);
  const content = useWorkspace((s) => s.currentContent);

  // 内容变化时重新统计（useMemo 依赖 content）
  const stats = useMemo(() => countStats(content), [content]);

  if (!currentFile) return null;

  return (
    <footer className="status-bar">
      <span className="status-item">字数 {stats.words}</span>
      <span className="status-sep">·</span>
      <span className="status-item">字符 {stats.chars}</span>
      <span className="status-sep">·</span>
      <span className="status-item">行 {stats.lines}</span>
      <span className="status-sep">·</span>
      <span className="status-item">阅读 {stats.readingMinutes} 分钟</span>
    </footer>
  );
}

export default StatusBar;
