// 最近打开文件区块

import { useState } from "react";
import { useWorkspace } from "../../store/workspace";
import { IconChevronDown, IconChevronRight, IconFileText } from "../icons";
import { FileOpenStatus } from "./FileOpenStatus";
import { basename } from "./treeShared";

export function RecentFiles() {
  const recentFiles = useWorkspace((s) => s.recentFiles);
  const currentFile = useWorkspace((s) => s.currentFile);
  const openFile = useWorkspace((s) => s.openFile);
  const openingFiles = useWorkspace((s) => s.openingFiles);
  const fileOpenErrors = useWorkspace((s) => s.fileOpenErrors);
  const [expanded, setExpanded] = useState(true);

  if (recentFiles.length === 0) return null;

  return (
    <div className="recent-section">
      <button className="recent-header" onClick={() => setExpanded((v) => !v)}>
        <span className="tree-icon">
          {expanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
        </span>
        <span className="recent-title">最近打开</span>
      </button>
      {expanded && (
        <div className="recent-list">
          {recentFiles.map((path) => {
            const active = currentFile === path;
            const opening = openingFiles.has(path);
            const error = fileOpenErrors.get(path);
            return (
              <button
                key={path}
                className={`tree-row tree-row-file${active ? " tree-row-active" : ""}`}
                style={{ paddingLeft: "24px" }}
                title={error ?? path}
                aria-busy={opening || undefined}
                onClick={() => void openFile(path).catch(() => {})}
              >
                <span className="tree-icon">
                  <IconFileText size={14} />
                </span>
                <span className="tree-name">{basename(path)}</span>
                <FileOpenStatus opening={opening} error={error} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
