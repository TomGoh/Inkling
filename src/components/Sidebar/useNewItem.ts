// 新建文件 / 文件夹流程 hook（issue #50 从 Sidebar 抽出）
// 右键菜单派发 new 动作后在目标目录下插入行内输入框，
// Enter 或失焦确认，Esc 取消；成功后按需刷新父目录。

import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspace } from "../../store/workspace";
import { createDir, createFile, joinPath } from "../../lib/fs";
import { showMessage } from "../../lib/dialogs";
import type { NewItemState } from "./treeShared";

export function useNewItem() {
  const openFile = useWorkspace((s) => s.openFile);
  const refreshTree = useWorkspace((s) => s.refreshTree);
  const setDirExpanded = useWorkspace((s) => s.setDirExpanded);

  const [newItem, setNewItem] = useState<NewItemState | null>(null);
  const [newItemValue, setNewItemValue] = useState("");
  const newInputRef = useRef<HTMLInputElement>(null);

  /** 在 parentPath 下开始新建（展开目录并清空输入） */
  const startNewItem = useCallback(
    (parentPath: string, kind: "file" | "dir") => {
      setNewItem({ parentPath, kind });
      setNewItemValue("");
      setDirExpanded(parentPath, true);
    },
    [setDirExpanded],
  );

  /** 取消新建（Esc） */
  const cancelNewItem = useCallback(() => setNewItem(null), []);

  /** 确认新建：文件创建后直接打开，目录创建后刷新父目录 */
  const commitNewItem = useCallback(async () => {
    if (!newItem) return;
    const item = newItem;
    const name = newItemValue.trim();
    setNewItem(null);
    setNewItemValue("");
    if (!name) return;

    const targetPath = joinPath(item.parentPath, name);
    try {
      if (item.kind === "file") {
        await createFile(targetPath);
        await openFile(targetPath);
      } else {
        await createDir(targetPath);
      }
      await refreshTree(item.parentPath);
    } catch (e) {
      await showMessage(`新建失败：${e instanceof Error ? e.message : String(e)}`, { kind: "error" });
    }
  }, [newItem, newItemValue, openFile, refreshTree]);

  // 进入新建态后聚焦输入框
  useEffect(() => {
    if (newItem && newInputRef.current) newInputRef.current.focus();
  }, [newItem]);

  return {
    newItem,
    newItemValue,
    newInputRef,
    startNewItem,
    setNewItemValue,
    commitNewItem,
    cancelNewItem,
  };
}
