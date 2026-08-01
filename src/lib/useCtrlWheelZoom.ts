// Ctrl/Cmd + 滚轮缩放文档 Hook
// 拦截浏览器原生页面缩放，改用应用内 zoom（50%~300%）。
//
// 性能关键设计（修复万行 MD 文档滚轮失效问题）：
// 仅在 Ctrl/Cmd 按下时才挂载 passive:false 的 wheel 监听器，
// 普通滚动时 window 上无任何 wheel 监听器，让浏览器走合成线程快速滚动路径。
// 万行文档下若 passive:false 监听器常驻，主线程被布局/绘制占用时滚轮会严重卡顿甚至失效。
//
// Mermaid 图表内部由其 NodeView 的 wheel 监听接管缩放，
// 这里检查 target 是否在 [data-mermaid] 内，是则跳过文档缩放。

import { useEffect } from "react";
import { useSettings, ZOOM_STEP } from "../store/settings";

export function useCtrlWheelZoom(): void {
  useEffect(() => {
    let ctrlHeld = false;

    const onWheel = (e: WheelEvent) => {
      // Mermaid 图表内部由其 NodeView 的 wheel 监听接管缩放
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-mermaid]")) return;
      e.preventDefault();
      // 向上滚（deltaY < 0）放大，向下滚缩小
      useSettings.getState().adjustEditorZoom(
        e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP,
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !ctrlHeld) {
        ctrlHeld = true;
        window.addEventListener("wheel", onWheel, {
          passive: false,
          capture: true,
        });
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey && ctrlHeld) {
        ctrlHeld = false;
        window.removeEventListener("wheel", onWheel, {
          capture: true,
        } as EventListenerOptions);
      }
    };
    // 窗口失焦时重置（防止 Ctrl 按住时切窗导致监听器残留）
    const onBlur = () => {
      if (ctrlHeld) {
        ctrlHeld = false;
        window.removeEventListener("wheel", onWheel, {
          capture: true,
        } as EventListenerOptions);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      if (ctrlHeld) {
        window.removeEventListener("wheel", onWheel, {
          capture: true,
        } as EventListenerOptions);
      }
    };
  }, []);
}
