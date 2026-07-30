// 文件变更监听 Hook
// 轮询当前活跃文件的修改时间，检测到外部修改时提示用户重新加载。
// - 文件未修改（dirty=false）：询问是否重载
// - 文件有未保存修改（dirty=true）：提示将丢弃当前修改
// 保存后会短暂忽略变更（2 秒窗口），避免自身保存触发误报。
// 仅桌面端（Tauri）生效，浏览器 mock 环境直接跳过。

import { useEffect, useRef } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useWorkspace } from "../store/workspace";
import { fileMtime } from "./fs";

const POLL_INTERVAL = 3000;
const SAVE_IGNORE_WINDOW = 2000;

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export function useFileWatcher(): void {
  const knownMtimeRef = useRef<number | null>(null);
  const ignoreUntilRef = useRef(0);
  const lastSavedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isTauri()) return;

    let timer: number | null = null;
    let cancelled = false;

    const check = async () => {
      if (cancelled) return;
      const { currentFile, dirty, openFile } = useWorkspace.getState();
      if (!currentFile) return;
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

      const msg = dirty
        ? `「${baseName(currentFile)}」已被外部修改，且当前有未保存的修改。\n是否丢弃当前修改并重新加载？`
        : `「${baseName(currentFile)}」已被外部修改，是否重新加载？`;
      if (window.confirm(msg)) {
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
      }
    });

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      unsub();
    };
  }, []);
}
