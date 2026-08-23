import { isTauri } from "./fs";

/**
 * 统一信息提示弹窗（优先调用 Tauri 桌面原生 message 对话框，Web 端回退 window.alert）
 */
export async function showMessage(
  message: string,
  options?: { title?: string; kind?: "info" | "warning" | "error" },
): Promise<void> {
  if (isTauri()) {
    try {
      const { message: tauriMessage } = await import("@tauri-apps/plugin-dialog");
      await tauriMessage(message, {
        title: options?.title || (options?.kind === "error" ? "错误" : "提示"),
        kind: options?.kind || "info",
      });
      return;
    } catch {
      // 降级回退
    }
  }
  window.alert(message);
}

/**
 * 统一确认询问对话框（优先调用 Tauri 桌面原生 ask 对话框，Web 端回退 window.confirm）
 */
export async function askConfirmation(
  message: string,
  options?: { title?: string; kind?: "info" | "warning" | "error" },
): Promise<boolean> {
  if (isTauri()) {
    try {
      const { ask } = await import("@tauri-apps/plugin-dialog");
      return await ask(message, {
        title: options?.title || "确认",
        kind: options?.kind || "info",
      });
    } catch {
      // 降级回退
    }
  }
  return window.confirm(message);
}
