// SourceModeEditor 挂载时初始滚动恢复测试（issue #136 方向 B）
// 验证「立即设置 + 逐帧 settle」收敛机制：
// 模拟 CM6 长文档挂载初期 scrollHeight 来自估算（maxScroll 偏小），
// 首次赋值被钳制；随真实测量逐步撑开后，settle 循环应把 scrollTop
// 修正到目标值，而非停留在被钳制的错误位置（旧实现为单次赋值）。

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { SourceModeEditor } from "../../src/components/Editor/SourceModeEditor";
import { useSettings } from "../../src/store/settings";

const LONG_TEXT = Array.from({ length: 400 }, (_, i) => `第 ${i + 1} 行内容`).join("\n");

describe("SourceModeEditor 初始滚动恢复（#136 方向 B）", () => {
  let rafQueue: FrameRequestCallback[];
  let originalRaf: typeof window.requestAnimationFrame;

  beforeEach(() => {
    rafQueue = [];
    originalRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = vi.fn();
    useSettings.setState({ codeBlockTheme: "none" });
  });

  afterEach(() => {
    window.requestAnimationFrame = originalRaf;
    cleanup();
  });

  const flushFrame = () => {
    const cbs = rafQueue.splice(0, rafQueue.length);
    for (const cb of cbs) cb(0);
  };

  it("挂载初期的钳制会随高度撑开被逐帧修正到目标位置", () => {
    const { container } = render(
      <SourceModeEditor
        filePath="/tmp/scroll-test.md"
        value={LONG_TEXT}
        onChange={() => {}}
        initialCursor={0}
        initialScrollTop={500}
        spellcheck={false}
      />,
    );

    const scroller = container.querySelector(".cm-scroller") as HTMLElement;
    expect(scroller).not.toBeNull();

    // 接管 scrollTop：模拟 CM 高度估算逐步被真实测量修正（maxScroll 逐帧增长）
    let maxScroll = 100;
    let current = 0;
    Object.defineProperty(scroller, "scrollTop", {
      get: () => current,
      set: (v: number) => {
        current = Math.max(0, Math.min(v, maxScroll));
      },
      configurable: true,
    });

    // 挂载时立即设置过一次：被初期 maxScroll=100 钳制
    expect(current).toBeLessThan(500);

    // 第 1 帧：settle 发现未到位，重试；maxScroll 仍不足 → 依然钳制
    flushFrame();
    expect(current).toBe(100);

    // 高度估算修正：maxScroll 增长到 300 → 下一帧重试后到 300
    maxScroll = 300;
    flushFrame();
    expect(current).toBe(300);

    // 高度完全撑开：maxScroll=800 → 重试后到达目标 500，再下一帧确认收敛退出
    maxScroll = 800;
    flushFrame();
    expect(current).toBe(500);
    const framesBeforeConverge = rafQueue.length;
    flushFrame();
    expect(current).toBe(500);
    // 收敛后不再排新帧
    expect(rafQueue.length).toBeLessThanOrEqual(framesBeforeConverge);
  });

  it("initialScrollTop 为 0 时不启动 settle 循环（无需恢复）", () => {
    render(
      <SourceModeEditor
        filePath="/tmp/scroll-test-2.md"
        value={LONG_TEXT}
        onChange={() => {}}
        initialCursor={0}
        initialScrollTop={0}
        spellcheck={false}
      />,
    );
    // 只剩 focus 的一帧 rAF，没有滚动 settle 的持续排队
    flushFrame();
    expect(rafQueue.length).toBe(0);
  });
});
