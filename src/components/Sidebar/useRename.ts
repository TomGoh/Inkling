// 重命名流程 hook：value / commit / cancel / 键盘 Enter·Esc（issue #50 从 Sidebar 抽出）
// 确认时调用 fs.renamePath 并同步 store 的 onFileRenamed（tab/书签/展开状态联动）。

import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspace } from "../../store/workspace";
import { joinPath, renamePath, type FileNode } from "../../lib/fs";
import { dirname } from "./treeShared";

export function useRename() {
  const onFileRenamed = useWorkspace((s) => s.onFileRenamed);

  const [renamingNode, setRenamingNode] = useState<FileNode | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  /** 进入重命名态：光标聚焦并全选原文件名 */
  const startRename = useCallback((node: FileNode) => {
    setRenamingNode(node);
    setRenameValue(node.name);
  }, []);

  /** 取消重命名（Esc / 切换目标） */
  const cancelRename = useCallback(() => setRenamingNode(null), []);

  /** 确认重命名：空值或未改名直接退出，失败弹错误提示 */
  const commitRename = useCallback(async () => {
    if (!renamingNode) return;
    const node = renamingNode;
    const newName = renameValue.trim();
    setRenamingNode(null);
    if (!newName || newName === node.name) return;

    const parent = dirname(node.path);
    const to = parent ? joinPath(parent, newName) : newName;
    try {
      await renamePath(node.path, to);
      onFileRenamed(node.path, to);
    } catch (e) {
      alert(`重命名失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }, [renamingNode, renameValue, onFileRenamed]);

  // 进入重命名态后聚焦并全选
  useEffect(() => {
    if (!renamingNode || !renameInputRef.current) return;
    renameInputRef.current.focus();
    renameInputRef.current.select();
  }, [renamingNode]);

  return {
    renamingNode,
    renameValue,
    renameInputRef,
    startRename,
    setRenameValue,
    commitRename,
    cancelRename,
  };
}
