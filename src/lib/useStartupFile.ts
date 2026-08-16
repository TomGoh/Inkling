// 启动时打开目标文件，三种来源：
// 1. 多窗口派生：URL 查询参数 inklingFile（由「在新窗口打开」创建的窗口）
// 2. 文件关联双击（首次启动）：Rust 端从 argv 提取，前端就绪后 take_pending_file 拉取
// 3. 单实例转发（程序已运行时双击 .md）：Rust 端 emit open-file 事件，定向到主窗口
import { useEffect } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getNewWindowFilePath } from "./newWindow";
import { useWorkspace } from "../store/workspace";

export function useStartupFile() {
  useEffect(() => {
    if (!isTauri()) return;
    const open = useWorkspace.getState().openFileStandalone;

    // 派生窗口只处理自身的派生目标，不参与 pending / 单实例（避免与主窗口重复打开）
    const winTarget = getNewWindowFilePath();
    if (winTarget) {
      void open(winTarget).catch(() => {});
      return;
    }

    // 主窗口：拉取首次启动的待打开文件
    let cancelled = false;
    invoke<string | null>("take_pending_file").then((p) => {
      if (!cancelled && p) void open(p).catch(() => {});
    });

    // 主窗口：监听单实例转发的双击打开事件
    const unlisten = listen<string>("open-file", (e) => {
      if (!cancelled) void open(e.payload).catch(() => {});
    });

    return () => {
      cancelled = true;
      void unlisten.then((fn) => fn());
    };
  }, []);
}
