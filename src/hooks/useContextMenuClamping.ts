import { useLayoutEffect, useRef } from "react";

interface UseContextMenuClampingOptions {
  x: number;
  y: number;
  padding?: number;
}

export function clampMenuPosition(
  x: number,
  y: number,
  menuWidth: number,
  menuHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  padding = 8,
): { x: number; y: number } {
  let finalX = x;
  let finalY = y;
  if (x + menuWidth > viewportWidth - padding) {
    finalX = Math.max(padding, viewportWidth - menuWidth - padding);
  }
  if (y + menuHeight > viewportHeight - padding) {
    finalY = Math.max(padding, viewportHeight - menuHeight - padding);
  }
  return { x: finalX, y: finalY };
}

export function useContextMenuClamping<T extends HTMLElement>({
  x,
  y,
  padding = 8,
}: UseContextMenuClampingOptions) {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    // 先应用初始位置，获取实际尺寸
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;

    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const { x: finalX, y: finalY } = clampMenuPosition(
      x,
      y,
      rect.width,
      rect.height,
      vw,
      vh,
      padding,
    );

    el.style.left = `${finalX}px`;
    el.style.top = `${finalY}px`;
  }, [x, y, padding]);

  return ref;
}
