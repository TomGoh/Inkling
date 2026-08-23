import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCtrlWheelZoom } from "../../src/lib/useCtrlWheelZoom";
import { useSettings } from "../../src/store/settings";

describe("useCtrlWheelZoom hook", () => {
  it("should zoom in/out with Ctrl+wheel within min/max bounds", () => {
    useSettings.setState({ editorZoom: 1.0 });
    renderHook(() => useCtrlWheelZoom());

    // 模拟按下 Ctrl 键挂载 wheel 监听
    window.dispatchEvent(new KeyboardEvent("keydown", { ctrlKey: true }));

    const div = document.createElement("div");
    document.body.appendChild(div);

    // 向上滚轮（缩放放大，deltaY < 0）
    const wheelUp = new WheelEvent("wheel", {
      ctrlKey: true,
      deltaY: -100,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      div.dispatchEvent(wheelUp);
    });

    expect(wheelUp.defaultPrevented).toBe(true);
    expect(useSettings.getState().editorZoom).toBeCloseTo(1.1);

    // 向下滚轮（缩放缩小，deltaY > 0）
    const wheelDown = new WheelEvent("wheel", {
      ctrlKey: true,
      deltaY: 100,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      div.dispatchEvent(wheelDown);
    });
    expect(useSettings.getState().editorZoom).toBeCloseTo(1.0);

    // 松开 Ctrl 键
    window.dispatchEvent(new KeyboardEvent("keyup", { ctrlKey: false }));
    document.body.removeChild(div);
  });

  it("should not zoom without ctrl/meta key", () => {
    useSettings.setState({ editorZoom: 1.0 });
    renderHook(() => useCtrlWheelZoom());

    const wheel = new WheelEvent("wheel", {
      ctrlKey: false,
      metaKey: false,
      deltaY: -100,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(wheel);
    });

    expect(wheel.defaultPrevented).toBe(false);
    expect(useSettings.getState().editorZoom).toBe(1.0);
  });
});
