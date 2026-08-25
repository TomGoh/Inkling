// 文件变更监听 Hook
// 轮询当前活跃文件的修改时间，检测到外部修改时：
// - 文件未修改（dirty=false）：confirm 询问是否重载
// - 文件有未保存修改（dirty=true）：读取磁盘最新内容，弹出冲突对话框
//   （ConflictDialog：另存副本 / 查看差异 / 丢弃重载 / 继续编辑）。
//   不再用 confirm 二选一——取消后直接保存会静默覆盖外部修改（用户口头反馈）。
// 保存后会短暂忽略变更（2 秒窗口），避免自身保存触发误报。
// 仅桌面端（Tauri）生效，浏览器 mock 环境直接跳过。

import { useEffect, useRef } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useWorkspace } from "../store/workspace";
import { useConflict } from "../store/conflict";
import { askConfirmation } from "./dialogs";
import { fileMtime, readTextFile } from "./fs";
import { baseName } from "./path-utils";

const POLL_INTERVAL = 3000;
const SAVE_IGNORE_WINDOW = 2000;

export function useFileWatcher(): void {
  const knownMtimesRef = useRef<Map<string, number>>(new Map());
  const ignoreUntilRef = useRef<number>(0);
  const lastSavedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isTauri()) return;

    let timer: number | null = null;
    let cancelled = false;

    const check = async () => {
      if (cancelled) return;
      const { openTabs, currentFile, dirty, reloadFile } = useWorkspace.getState();
      if (openTabs.length === 0) return;
      if (Date.now() < ignoreUntilRef.current) return;

      const tabsToCheck = openTabs.filter((t) => !t.isUntitled);
      const isConflictOpen = Boolean(useConflict.getState().conflict);

      for (const tab of tabsToCheck) {
        if (cancelled) return;
        const filePath = tab.path;
        const isActive = filePath === currentFile;

        let mtime: number;
        try {
          mtime = await fileMtime(filePath);
          if (tab.deletedOnDisk) {
            useWorkspace.setState((current) => ({
              openTabs: current.openTabs.map((t) =>
                t.path === filePath ? { ...t, deletedOnDisk: false } : t,
              ),
            }));
          }
        } catch {
          // 获取 mtime 失败，说明文件在磁盘上可能被删除或无法访问
          if (!tab.deletedOnDisk) {
            useWorkspace.setState((current) => ({
              openTabs: current.openTabs.map((t) =>
                t.path === filePath ? { ...t, deletedOnDisk: true } : t,
              ),
            }));
          }
          continue;
        }

        const knownMtime = knownMtimesRef.current.get(filePath);
        if (knownMtime === undefined) {
          knownMtimesRef.current.set(filePath, mtime);
          continue;
        }

        if (Math.abs(mtime - knownMtime) < 5) continue;
        knownMtimesRef.current.set(filePath, mtime);

        // 如果是当前活跃文件且未打开冲突对话框，则触发相应处理
        if (isActive && !isConflictOpen) {
          if (dirty) {
            // 本地有未保存修改：读取磁盘最新内容，弹冲突对话框（三选项 + Diff）
            try {
              const diskContent = await readTextFile(filePath);
              if (cancelled) return;
              if (useWorkspace.getState().currentFile !== filePath) return;
              useConflict.getState().openConflict({
                filePath,
                localContent: useWorkspace.getState().currentContent,
                diskContent,
                detectedAt: Date.now(),
              });
            } catch {
              // 磁盘读取失败（文件被删除等）：使用统一 dialog 提示
              const shouldReload = await askConfirmation(
                `「${baseName(filePath)}」已被外部修改或删除，且当前有未保存的修改。\n是否丢弃当前修改并重新加载？`,
                { title: "文件冲突", kind: "warning" },
              );
              if (shouldReload) {
                try {
                  await reloadFile(filePath);
                } catch (err) {
                  console.warn("reloadFile failed", err);
                }
                knownMtimesRef.current.delete(filePath);
              }
            }
          } else {
            // 本地无修改：询问重载
            const shouldReload = await askConfirmation(
              `「${baseName(filePath)}」已被外部修改，是否重新加载？`,
              { title: "文件已被外部修改", kind: "info" },
            );
            if (shouldReload) {
              try {
                await reloadFile(filePath);
              } catch (err) {
                console.warn("reloadFile failed", err);
              }
              knownMtimesRef.current.delete(filePath);
            }
          }
        }
      }
    };

    timer = window.setInterval(check, POLL_INTERVAL);

    // 窗口重新获得焦点或页面可见时立即触发检查
    const onFocusOrVisible = () => {
      void check();
    };
    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);

    // 监听 store：保存后忽略一段时间；切换文件后重置已知 mtime
    let lastFile = useWorkspace.getState().currentFile;
    const unsub = useWorkspace.subscribe((s) => {
      if (s.lastSavedAt && s.lastSavedAt !== lastSavedAtRef.current) {
        lastSavedAtRef.current = s.lastSavedAt;
        ignoreUntilRef.current = Date.now() + SAVE_IGNORE_WINDOW;
      }
      if (s.currentFile !== lastFile) {
        lastFile = s.currentFile;
        // 切走文件时关掉残留的冲突对话框（上下文已失配）
        if (useConflict.getState().conflict) {
          useConflict.getState().dismiss();
        }
      }
    });

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
      unsub();
    };
  }, []);
}
