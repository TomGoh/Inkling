import { useEffect, useRef } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { flushAllMarkdownPublishers } from "../components/Editor/markdown-publisher";
import { useWorkspace } from "../store/workspace";

/**
 * Flush pending editor changes and save dirty tabs before the window exits.
 * A ref-backed mutex prevents repeated close requests from interleaving saves,
 * dialogs, active-tab switches, or window destruction.
 */
export function useExitHandler(): void {
  const closeInProgressRef = useRef(false);

  useEffect(() => {
    const handleBeforeUnload = () => {
      flushAllMarkdownPublishers();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    let disposed = false;
    let unlistenClose: (() => void) | undefined;
    if (isTauri()) {
      const win = getCurrentWindow();
      void win.onCloseRequested(async (event) => {
        event.preventDefault();
        if (closeInProgressRef.current) return;
        closeInProgressRef.current = true;

        try {
          flushAllMarkdownPublishers();
          const currentTabs = useWorkspace.getState().openTabs;
          const dirtyTabs = currentTabs.filter((tab) => tab.dirty);
          const originalActivePath = useWorkspace.getState().activeTabPath;

          for (const tab of dirtyTabs) {
            try {
              useWorkspace.getState().switchTab(tab.path);
              await useWorkspace.getState().saveCurrent();
            } catch {
              // A failed tab must not prevent later tabs from being offered a save.
            }
          }

          const stillDirty = useWorkspace.getState().openTabs.some((tab) => tab.dirty);
          if (stillDirty) {
            try {
              const { ask } = await import("@tauri-apps/plugin-dialog");
              const confirmed = await ask(
                "存在未保存的文档修改。退出将丢失这些修改，确定要退出吗？",
                { title: "退出确认", kind: "warning" },
              );
              if (!confirmed) {
                if (originalActivePath) {
                  useWorkspace.getState().switchTab(originalActivePath);
                }
                return;
              }
            } catch {
              // Fail safe: dialog errors must never discard unsaved content.
              if (originalActivePath) {
                useWorkspace.getState().switchTab(originalActivePath);
              }
              return;
            }
          }

          await win.destroy();
        } finally {
          closeInProgressRef.current = false;
        }
      }).then((unlisten) => {
        if (disposed) {
          unlisten();
        } else {
          unlistenClose = unlisten;
        }
      });
    }

    return () => {
      disposed = true;
      window.removeEventListener("beforeunload", handleBeforeUnload);
      unlistenClose?.();
    };
  }, []);
}
