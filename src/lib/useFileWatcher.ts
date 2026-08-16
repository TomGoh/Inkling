// 文件变更监听 Hook
// 轮询当前活跃文件的修改时间，检测到外部修改时：
// - 文件未修改（dirty=false）：confirm 询问是否重载
// - 文件有未保存修改（dirty=true）：读取磁盘最新内容，弹出冲突对话框
//   （ConflictDialog：另存副本 / 查看差异 / 丢弃重载 / 继续编辑）。
//   不再用 confirm 二选一——取消后直接保存会静默覆盖外部修改（issue #58）。
// 保存后会短暂忽略变更（2 秒窗口），避免自身保存触发误报。
// 仅桌面端（Tauri）生效，浏览器 mock 环境直接跳过。

import { useEffect, useRef } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useWorkspace } from "../store/workspace";
import { useConflict } from "../store/conflict";
import { fileMtime, readTextFile } from "./fs";

const POLL_INTERVAL = 3000;
const SAVE_IGNORE_WINDOW = 2000;

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export function useFileWatcher(): void {
  const knownMtimeRef = useRef<number | null>(null);
  const ignoreUntilRef = useRef<number>(0);
  const lastSavedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isTauri()) return;

    let timer: number | null = null;
    let cancelled = false;

    const check = async () => {
      if (cancelled) return;
      const { currentFile, dirty, openFile } = useWorkspace.getState();
      if (!currentFile) return;
      // 冲突对话框已打开时不重复检测，避免轮询期间再次弹窗
      if (useConflict.getState().conflict) return;
      if (Date.now() < ignoreUntilRef.current) return;

      let mtime: number;
      try {
        mtime = await fileMtime(currentFile);
      } catch {
        return;
      }
      if (cancelled) return;

      if (knownMtimeRef.current === null) {
        knownMtimeRef.current = mtime;
        return;
      }
      if (Math.abs(mtime - knownMtimeRef.current) < 1) return;
      knownMtimeRef.current = mtime;

      if (dirty) {
        // 本地有未保存修改：读取磁盘最新内容，弹冲突对话框（三选项 + Diff）
        try {
          const diskContent = await readTextFile(currentFile);
          if (cancelled) return;
          // 等待读取期间用户可能已切文件，按路径再核对一次
          if (useWorkspace.getState().currentFile !== currentFile) return;
          useConflict.getState().openConflict({
            filePath: currentFile,
            localContent: useWorkspace.getState().currentContent,
            diskContent,
            detectedAt: Date.now(),
          });
        } catch {
          // 磁盘读取失败（文件被删除等）：回退 confirm 提示
          if (
            window.confirm(
              `「${baseName(currentFile)}」已被外部修改或删除，且当前有未保存的修改。\n是否丢弃当前修改并重新加载？`,
            )
          ) {
            await openFile(currentFile);
            knownMtimeRef.current = null;
          }
        }
        return;
      }

      // 本地无修改：confirm 询问重载
      if (window.confirm(`「${baseName(currentFile)}」已被外部修改，是否重新加载？`)) {
        await openFile(currentFile);
        knownMtimeRef.current = null;
      }
    };

    timer = window.setInterval(check, POLL_INTERVAL);

    // 监听 store：保存后忽略一段时间；切换文件后重置已知 mtime
    let lastFile = useWorkspace.getState().currentFile;
    const unsub = useWorkspace.subscribe((s) => {
      if (s.lastSavedAt && s.lastSavedAt !== lastSavedAtRef.current) {
        lastSavedAtRef.current = s.lastSavedAt;
        ignoreUntilRef.current = Date.now() + SAVE_IGNORE_WINDOW;
        knownMtimeRef.current = null;
      }
      if (s.currentFile !== lastFile) {
        lastFile = s.currentFile;
        knownMtimeRef.current = null;
        // 切走文件时关掉残留的冲突对话框（上下文已失配）
        if (useConflict.getState().conflict) {
          useConflict.getState().dismiss();
        }
      }
    });

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      unsub();
    };
  }, []);
}
