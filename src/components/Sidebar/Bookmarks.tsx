// 书签文件区块

import { useWorkspace } from "../../store/workspace";
import { useUI } from "../../store/ui";
import { IconChevronDown, IconChevronRight, IconStarFilled, IconX } from "../icons";
import { FileOpenStatus } from "./FileOpenStatus";
import { basename } from "./treeShared";

export function Bookmarks() {
  const bookmarks = useWorkspace((s) => s.bookmarks);
  const currentFile = useWorkspace((s) => s.currentFile);
  const openFile = useWorkspace((s) => s.openFile);
  const openingFiles = useWorkspace((s) => s.openingFiles);
  const fileOpenErrors = useWorkspace((s) => s.fileOpenErrors);
  const toggleBookmark = useWorkspace((s) => s.toggleBookmark);
  // 折叠状态持久化到 UI store（issue #167），重挂载/切换工作区后保持
  const expanded = useUI((s) => s.sectionExpanded.bookmarks);
  const toggleSectionExpanded = useUI((s) => s.toggleSectionExpanded);

  if (bookmarks.length === 0) return null;

  return (
    <div className="recent-section">
      <button className="recent-header" onClick={() => toggleSectionExpanded("bookmarks")}>
        <span className="tree-icon">
          {expanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
        </span>
        <span className="recent-title">书签</span>
      </button>
      {expanded && (
        <div className="recent-list">
          {bookmarks.map((path) => {
            const active = currentFile === path;
            const opening = openingFiles.has(path);
            const error = fileOpenErrors.get(path);
            return (
              <div
                key={path}
                className={`tree-row tree-row-file${active ? " tree-row-active" : ""}`}
                style={{ paddingLeft: "24px" }}
                title={error ?? path}
              >
                <button
                  className="tree-row-main"
                  aria-busy={opening || undefined}
                  onClick={() => void openFile(path).catch(() => {})}
                >
                  <span className="tree-icon tree-icon-star">
                    <IconStarFilled size={13} />
                  </span>
                  <span className="tree-name">{basename(path)}</span>
                  <FileOpenStatus opening={opening} error={error} />
                </button>
                <button
                  className="tree-row-side"
                  title="取消书签"
                  onClick={() => toggleBookmark(path)}
                >
                  <IconX size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
