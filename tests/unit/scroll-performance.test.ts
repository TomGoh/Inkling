// 滚轮缩放性能测试
// 验证 v1.2.4 修复的「万行 MD 文档滚轮失效」问题：
// 通过仅在 Ctrl/Cmd 按下时挂载 passive:false 的 wheel 监听器，
// 普通滚动时 window 上无任何 wheel 监听器，避免主线程被阻塞时滚轮卡顿/失效。
//
// 测试策略：
// 1. 通过监听 window 的 addEventListener/removeEventListener 调用，
//    验证 wheel 监听器是按需挂载/卸载的（不是常驻）
// 2. Ctrl 按下时挂载 wheel 监听器，Ctrl 抬起时卸载
// 3. wheel 事件在 Ctrl 按下时调用 adjustEditorZoom
// 4. 普通滚动（无 Ctrl）不触发缩放
// 5. Mermaid 图标区域的 wheel 不触发文档缩放
// 6. 窗口失焦时清理残留监听器
// 7. 卸载组件时清理所有监听器
// 8. 大文档场景：挂载 hook 不阻塞主线程（wheel 监听器数量恒定，不随文档增长）

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { useCtrlWheelZoom } from "../../src/lib/useCtrlWheelZoom";
import { useSettings, ZOOM_STEP } from "../../src/store/settings";
import * as React from "react";

// 测试用组件：挂载 useCtrlWheelZoom hook
function TestComponent() {
  useCtrlWheelZoom();
  return React.createElement("div", { "data-testid": "test" });
}

// 辅助：派发键盘事件
function dispatchKey(type: "keydown" | "keyup", ctrlKey = false, metaKey = false) {
  window.dispatchEvent(
    new KeyboardEvent(type, { ctrlKey, metaKey, bubbles: true }),
  );
}

// 辅助：派发 wheel 事件，返回是否被 preventDefault
function dispatchWheel(
  deltaY: number,
  target: Element | null = null,
  ctrlKey = false,
): boolean {
  const event = new WheelEvent("wheel", {
    deltaY,
    bubbles: true,
    cancelable: true,
    ctrlKey,
  });
  // happy-dom WheelEvent 不支持设置 target，但 capture 阶段监听能拿到 e.target
  // 通过在 document.body 上派发，e.target 默认为 body
  if (target) {
    target.dispatchEvent(event);
  } else {
    document.body.dispatchEvent(event);
  }
  return event.defaultPrevented;
}

beforeEach(() => {
  // 重置 settings store 的缩放
  useSettings.getState().resetEditorZoom();
  // 清空 window 上所有监听器（happy-dom 不提供，靠 mock 跟踪）
});

afterEach(() => {
  cleanup();
});

describe("useCtrlWheelZoom 滚轮性能优化", () => {
  it("初始挂载时 window 上无 wheel 监听器（普通滚动走浏览器快速路径）", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    render(React.createElement(TestComponent));
    // 收集所有 addEventListener 调用的第一个参数
    const eventTypes = addSpy.mock.calls.map((c) => c[0]);
    // keydown / keyup / blur 应被挂载
    expect(eventTypes).toContain("keydown");
    expect(eventTypes).toContain("keyup");
    expect(eventTypes).toContain("blur");
    // wheel 不应在初始时挂载（这是性能优化的核心）
    expect(eventTypes).not.toContain("wheel");
  });

  it("Ctrl 按下时挂载 wheel 监听器", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    render(React.createElement(TestComponent));
    addSpy.mockClear(); // 清掉初始挂载的调用
    dispatchKey("keydown", true);
    // 应新挂载一个 wheel 监听器
    const wheelCalls = addSpy.mock.calls.filter((c) => c[0] === "wheel");
    expect(wheelCalls.length).toBe(1);
    // 第三参数应指定 passive: false（capture: true）
    const opts = wheelCalls[0][2] as AddEventListenerOptions;
    expect(opts.passive).toBe(false);
    expect(opts.capture).toBe(true);
  });

  it("Ctrl 抬起时卸载 wheel 监听器", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    render(React.createElement(TestComponent));
    dispatchKey("keydown", true);
    removeSpy.mockClear();
    dispatchKey("keyup", false);
    // 应卸载 wheel 监听器
    const wheelCalls = removeSpy.mock.calls.filter((c) => c[0] === "wheel");
    expect(wheelCalls.length).toBe(1);
    const opts = wheelCalls[0][2] as EventListenerOptions;
    expect(opts.capture).toBe(true);
  });

  it("Cmd（metaKey）按下也挂载 wheel 监听器（macOS 场景）", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    render(React.createElement(TestComponent));
    addSpy.mockClear();
    dispatchKey("keydown", false, true);
    expect(addSpy.mock.calls.filter((c) => c[0] === "wheel").length).toBe(1);
  });

  it("Ctrl 按住时 wheel 向上滚放大文档", () => {
    render(React.createElement(TestComponent));
    dispatchKey("keydown", true);
    const before = useSettings.getState().editorZoom;
    dispatchWheel(-100, null, true);
    const after = useSettings.getState().editorZoom;
    expect(after).toBeGreaterThan(before);
    expect(after).toBe(Math.round((before + ZOOM_STEP) * 10) / 10);
  });

  it("Ctrl 按住时 wheel 向下滚缩小文档", () => {
    render(React.createElement(TestComponent));
    dispatchKey("keydown", true);
    useSettings.getState().setEditorZoom(1.5);
    dispatchWheel(100, null, true);
    expect(useSettings.getState().editorZoom).toBe(1.4);
  });

  it("普通滚动（无 Ctrl）不触发缩放", () => {
    render(React.createElement(TestComponent));
    const before = useSettings.getState().editorZoom;
    // 不按 Ctrl 直接 wheel（捕获阶段监听器未挂载，事件不拦截也不缩放）
    dispatchWheel(-100, null, false);
    expect(useSettings.getState().editorZoom).toBe(before);
  });

  it("wheel 事件触发 preventDefault（拦截浏览器原生页面缩放）", () => {
    render(React.createElement(TestComponent));
    dispatchKey("keydown", true);
    // body 上 wheel 应被 preventDefault
    const prevented = dispatchWheel(-100, document.body, true);
    expect(prevented).toBe(true);
  });

  it("Mermaid 图表区域内的 wheel 不触发文档缩放（由 Mermaid NodeView 接管）", () => {
    render(React.createElement(TestComponent));
    // 构造一个带 [data-mermaid] 的容器
    const mermaidContainer = document.createElement("div");
    mermaidContainer.setAttribute("data-mermaid", "");
    document.body.appendChild(mermaidContainer);
    dispatchKey("keydown", true);
    const before = useSettings.getState().editorZoom;
    dispatchWheel(-100, mermaidContainer, true);
    expect(useSettings.getState().editorZoom).toBe(before);
    document.body.removeChild(mermaidContainer);
  });

  it("窗口失焦时清理残留的 wheel 监听器", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    render(React.createElement(TestComponent));
    dispatchKey("keydown", true); // 挂载 wheel
    removeSpy.mockClear();
    // 模拟按住 Ctrl 切窗（blur）
    window.dispatchEvent(new Event("blur"));
    // 应卸载 wheel 监听器
    expect(removeSpy.mock.calls.filter((c) => c[0] === "wheel").length).toBe(1);
  });

  it("Ctrl 多次重复按下只挂载一次 wheel 监听器（幂等）", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    render(React.createElement(TestComponent));
    addSpy.mockClear();
    dispatchKey("keydown", true);
    dispatchKey("keydown", true);
    dispatchKey("keydown", true);
    expect(addSpy.mock.calls.filter((c) => c[0] === "wheel").length).toBe(1);
  });

  it("组件卸载时清理所有监听器（无内存泄漏）", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(React.createElement(TestComponent));
    dispatchKey("keydown", true); // 挂载 wheel
    unmount();
    // 应清理 keydown / keyup / blur（以及因 ctrlHeld 的 wheel）
    const removed = removeSpy.mock.calls.map((c) => c[0]);
    expect(removed).toContain("keydown");
    expect(removed).toContain("keyup");
    expect(removed).toContain("blur");
    expect(removed).toContain("wheel");
  });

  it("组件卸载后 wheel 不再触发缩放（监听器已清理）", () => {
    const { unmount } = render(React.createElement(TestComponent));
    dispatchKey("keydown", true);
    unmount();
    const before = useSettings.getState().editorZoom;
    dispatchWheel(-100, document.body, true);
    expect(useSettings.getState().editorZoom).toBe(before);
  });

  it("缩放夹在 [0.5, 3] 范围内", () => {
    render(React.createElement(TestComponent));
    dispatchKey("keydown", true);
    // 持续向下滚到底
    for (let i = 0; i < 50; i++) {
      dispatchWheel(100, document.body, true);
    }
    expect(useSettings.getState().editorZoom).toBe(0.5);
    // 持续向上滚到顶
    for (let i = 0; i < 50; i++) {
      dispatchWheel(-100, document.body, true);
    }
    expect(useSettings.getState().editorZoom).toBe(3);
  });

  it("大文档场景：wheel 监听器数量恒定，不随文档节点数增长", () => {
    // 模拟万行文档：在 body 下塞 10000 个 div 节点
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 10000; i++) {
      const div = document.createElement("div");
      div.textContent = `line ${i}`;
      fragment.appendChild(div);
    }
    document.body.appendChild(fragment);

    const addSpy = vi.spyOn(window, "addEventListener");
    render(React.createElement(TestComponent));
    addSpy.mockClear();
    dispatchKey("keydown", true);
    // wheel 监听器只应有 1 个（不论文档多大）
    expect(addSpy.mock.calls.filter((c) => c[0] === "wheel").length).toBe(1);

    // 清理
    document.body.innerHTML = "";
  });
});
