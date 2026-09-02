// 多窗口：在新窗口打开指定文件。
// 桌面端（Tauri）通过 WebviewWindow 创建独立窗口，把文件路径经 URL 查询参数传给新窗口；
// 新窗口启动时读取该参数并调用 openFileStandalone 打开。
// 浏览器端无多窗口概念，回退到在当前窗口新开一个 tab（openFile）。

import { isTauri } from "@tauri-apps/api/core";

/** URL 查询参数键名：新窗口要打开的文件路径 */
export const NEW_WINDOW_FILE_KEY = "inklingFile";

/**
 * 读取本窗口启动时携带的目标文件路径（来自 URL 查询参数）。
 * 主窗口无此参数返回 null；由「在新窗口打开」派生的窗口返回对应路径。
 */
export function getNewWindowFilePath(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const v = params.get(NEW_WINDOW_FILE_KEY);
    // URLSearchParams.get() already decodes percent escapes once. Decoding a
    // second time corrupts literal sequences in filenames (for example `%20`).
    return v || null;
  } catch {
    return null;
  }
}

/**
 * 在新窗口打开给定文件。
 * - Tauri：创建新的 WebviewWindow，URL 带上 ?inklingFile=<encoded>
 * - 浏览器：回退到当前窗口打开（无多窗口能力）
 */
export async function openInNewWindow(filePath: string): Promise<boolean> {
  if (!isTauri()) {
    return false;
  }
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  // 用当前窗口 URL 作为基础，附加查询参数，保证 dev/prod 路径一致
  const base = window.location.origin + window.location.pathname;
  const url = `${base}?${NEW_WINDOW_FILE_KEY}=${encodeURIComponent(filePath)}`;
  // 窗口 label 必须唯一，用时间戳 + 随机后缀避免冲突
  const label = `inkling-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const title = filePath.split(/[\\/]/).pop() ?? "InklingMD";
  try {
    const webview = new WebviewWindow(label, {
      url,
      title,
      width: 1200,
      height: 800,
      minWidth: 720,
      minHeight: 480,
    });
    // Tauri reports native creation asynchronously. The constructor itself
    // returns immediately, so awaiting `new WebviewWindow(...)` cannot detect
    // failures such as a duplicate label or an invalid URL.
    return await new Promise<boolean>((resolve) => {
      let settled = false;
      let unlistenCreated: (() => void) | undefined;
      let unlistenError: (() => void) | undefined;
      const settle = (created: boolean, error?: unknown) => {
        if (settled) return;
        settled = true;
        unlistenCreated?.();
        unlistenError?.();
        if (error !== undefined) console.error("创建新窗口失败:", error);
        resolve(created);
      };

      void webview.once("tauri://created", () => settle(true)).then((unlisten) => {
        unlistenCreated = unlisten;
        if (settled) unlisten();
      }).catch((error) => settle(false, error));
      void webview.once("tauri://error", (event) => settle(false, event.payload)).then((unlisten) => {
        unlistenError = unlisten;
        if (settled) unlisten();
      }).catch((error) => settle(false, error));
    });
  } catch (e) {
    console.error("创建新窗口失败:", e);
    return false;
  }
}
