// 外部删除备份（快照）区块与恢复入口

import { useEffect, useState } from "react";
import { useWorkspace } from "../../store/workspace";
import {
  clearDeletedSnapshots,
  loadDeletedSnapshots,
  removeDeletedSnapshot,
  type DeletedFileSnapshot,
} from "../../store/workspace/shared";
import { IconChevronDown, IconChevronRight, IconFileText, IconTrash2 } from "../icons";
import { basename } from "./treeShared";
import { askConfirmation } from "../../lib/dialogs";

export function DeletedSnapshots() {
  const [snapshots, setSnapshots] = useState<DeletedFileSnapshot[]>([]);
  const [expanded, setExpanded] = useState(true);
  const openUntitledTabWithContent = useWorkspace((s) => s.openUntitledTabWithContent);

  // 定期或初始同步 localStorage 快照
  const refresh = () => {
    setSnapshots(loadDeletedSnapshots());
  };

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 2000);
    return () => window.clearInterval(timer);
  }, []);

  if (snapshots.length === 0) return null;

  const handleRestore = (snapshot: DeletedFileSnapshot) => {
    openUntitledTabWithContent(snapshot.content);
    removeDeletedSnapshot(snapshot.path);
    refresh();
  };

  const handleClearAll = async () => {
    const count = snapshots.length;
    const ok = await askConfirmation(
      `确定要清除全部 ${count} 个备份快照吗？\n将永久丢失这些文件的未保存内容，且无法恢复。`,
      {
        title: "清除全部可恢复文件",
        kind: "warning",
      },
    );
    if (!ok) return;
    clearDeletedSnapshots();
    refresh();
  };

  return (
    <div className="recent-section deleted-snapshots-section">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button
          className="recent-header"
          style={{ flex: 1 }}
          onClick={() => setExpanded((v) => !v)}
          title="外部删除的文件残留快照"
        >
          <span className="tree-icon">
            {expanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
          </span>
          <span className="recent-title" style={{ color: "var(--accent, #e5a50a)" }}>
            可恢复文件 ({snapshots.length})
          </span>
        </button>
        {expanded && (
          <button
            className="sidebar-btn-icon"
            style={{ marginRight: 8, padding: 2, opacity: 0.7 }}
            onClick={handleClearAll}
            title="清除全部备份"
            aria-label="清除全部备份"
          >
            <IconTrash2 size={13} />
          </button>
        )}
      </div>

      {expanded && (
        <div className="recent-list">
          {snapshots.map((snap) => {
            const timeStr = new Date(snap.deletedAt).toLocaleTimeString();
            return (
              <div
                key={snap.path}
                className="tree-row tree-row-file"
                style={{
                  paddingLeft: "24px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
                title={`原路径：${snap.path}\n删除备份时间：${timeStr}\n点击恢复为新标签页`}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    flex: 1,
                    overflow: "hidden",
                    cursor: "pointer",
                  }}
                  onClick={() => handleRestore(snap)}
                >
                  <span className="tree-icon">
                    <IconFileText size={14} />
                  </span>
                  <span
                    className="tree-name"
                    style={{ textDecoration: "line-through", opacity: 0.85 }}
                  >
                    {basename(snap.path)}
                  </span>
                </div>
                <button
                  className="sidebar-btn-icon"
                  style={{
                    fontSize: "11px",
                    padding: "2px 6px",
                    border: "1px solid var(--border-color, #444)",
                    borderRadius: "3px",
                    cursor: "pointer",
                  }}
                  onClick={() => handleRestore(snap)}
                  title="恢复为未命名新标签页"
                >
                  恢复
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
