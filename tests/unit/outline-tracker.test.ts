import { describe, expect, it, vi } from "vitest";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { EditorView } from "@milkdown/kit/prose/view";
import { outlineTrackerPlugin } from "../../src/components/Editor/outline-tracker";

function rect(left: number, top: number, right: number, bottom: number): DOMRect {
  return {
    x: left,
    y: top,
    top,
    bottom,
    left,
    right,
    width: right - left,
    height: bottom - top,
    toJSON: () => ({}),
  } as DOMRect;
}

function mockDocument(): ProseMirrorNode {
  const positions = [0, 100, 200];
  const headings = positions.map((_, index) => ({
    type: { name: "heading" },
    attrs: { level: 2, id: `heading-${index}` },
    descendants: (callback: (child: unknown) => void) => {
      callback({ isText: true, text: `标题 ${index + 1}` });
    },
  }));
  return {
    descendants: (callback: (node: unknown, pos: number) => void) => {
      headings.forEach((heading, index) => callback(heading, positions[index]));
    },
  } as unknown as ProseMirrorNode;
}

describe("outlineTrackerPlugin 视口跟踪", () => {
  it("将采样点限制在编辑器内，并在无法采样时保留当前高亮", () => {
    const scroller = document.createElement("div");
    scroller.className = "editor-scroll";
    const editorDom = document.createElement("div");
    scroller.append(editorDom);
    document.body.append(scroller);
    scroller.getBoundingClientRect = () => rect(0, 100, 600, 500);
    // 模拟 .milkdown 的 2.5rem 顶部 padding：ProseMirror DOM 比滚动区低 40px。
    editorDom.getBoundingClientRect = () => rect(100, 140, 500, 900);

    const state = {
      doc: mockDocument(),
      selection: { head: 1 },
    };
    const posAtCoords = vi.fn((coords: { left: number; top: number }) =>
      coords.top > 140 ? { pos: 1, inside: 0 } : null,
    );
    const view = {
      dom: editorDom,
      state,
      posAtCoords,
    } as unknown as EditorView;
    const onChange = vi.fn();
    const plugin = outlineTrackerPlugin(onChange);

    let pendingFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      pendingFrame = callback;
      return 17;
    });
    const pluginView = plugin.spec.view?.(view);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ activeIndex: 0 }),
    );
    onChange.mockClear();

    scroller.dispatchEvent(new Event("scroll"));
    pendingFrame?.(0);

    expect(posAtCoords).toHaveBeenCalledWith({ left: 116, top: 141 });
    expect(onChange).not.toHaveBeenCalled();

    posAtCoords.mockReturnValueOnce(null);
    scroller.dispatchEvent(new Event("scroll"));
    pendingFrame?.(1);
    expect(posAtCoords).toHaveBeenCalledTimes(2);
    expect(onChange).not.toHaveBeenCalled();

    pluginView?.destroy?.();
    scroller.remove();
  });

  it("按动画帧合并正文滚动，并在销毁时移除监听", () => {
    const scroller = document.createElement("div");
    scroller.className = "editor-scroll";
    const editorDom = document.createElement("div");
    scroller.append(editorDom);
    document.body.append(scroller);
    scroller.getBoundingClientRect = () => rect(0, 100, 600, 500);
    editorDom.getBoundingClientRect = () => rect(100, 100, 500, 900);

    const state = {
      doc: mockDocument(),
      selection: { head: 1 },
    };
    const posAtCoords = vi.fn(() => ({ pos: 250, inside: 200 }));
    const view = {
      dom: editorDom,
      state,
      posAtCoords,
    } as unknown as EditorView;
    const onChange = vi.fn();
    const plugin = outlineTrackerPlugin(onChange);

    let pendingFrame: FrameRequestCallback | null = null;
    const requestFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        pendingFrame = callback;
        return 17;
      });
    const cancelFrame = vi.spyOn(window, "cancelAnimationFrame");
    const pluginView = plugin.spec.view?.(view);
    expect(pluginView).toBeDefined();
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ activeIndex: 0 }),
    );
    onChange.mockClear();

    scroller.dispatchEvent(new Event("scroll"));
    scroller.dispatchEvent(new Event("scroll"));
    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();

    pendingFrame?.(0);
    expect(posAtCoords).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ activeIndex: 2 }),
    );

    scroller.dispatchEvent(new Event("scroll"));
    expect(requestFrame).toHaveBeenCalledTimes(2);
    pluginView?.destroy?.();
    expect(cancelFrame).toHaveBeenCalledWith(17);
    scroller.dispatchEvent(new Event("scroll"));
    expect(requestFrame).toHaveBeenCalledTimes(2);
    scroller.remove();
  });
});

describe("outlineTrackerPlugin 编辑防抖", () => {
  function makeView(doc: ProseMirrorNode) {
    const editorDom = document.createElement("div");
    document.body.append(editorDom);
    const view = {
      dom: editorDom,
      state: { doc, selection: { head: 1, eq: () => true } },
    } as unknown as EditorView & {
      state: { doc: ProseMirrorNode; selection: { head: number; eq: () => boolean } };
    };
    return { view, editorDom };
  }

  it("连续 doc 变更防抖 150ms 后只发布一次", () => {
    vi.useFakeTimers();
    const { view, editorDom } = makeView(mockDocument());
    const onChange = vi.fn();
    const plugin = outlineTrackerPlugin(onChange);
    const pluginView = plugin.spec.view?.(view as unknown as EditorView);
    onChange.mockClear();

    // 连续三次 doc 变更：A→B→C，选区视为未变（eq 恒真）
    const sel = { head: 250, eq: () => true };
    const sA = view.state;
    const sB = { doc: mockDocument(), selection: sel };
    const sC = { doc: mockDocument(), selection: sel };
    view.state = sB;
    pluginView?.update?.(view as unknown as EditorView, sA as never);
    view.state = sC;
    pluginView?.update?.(view as unknown as EditorView, sB as never);
    // 防抖窗口内不发布，避免每键全文遍历标题
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(160);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ activeIndex: 2 }),
    );

    pluginView?.destroy?.();
    vi.useRealTimers();
    editorDom.remove();
  });

  it("销毁后不再发布待定提取", () => {
    vi.useFakeTimers();
    const { view, editorDom } = makeView(mockDocument());
    const onChange = vi.fn();
    const plugin = outlineTrackerPlugin(onChange);
    const pluginView = plugin.spec.view?.(view as unknown as EditorView);
    onChange.mockClear();

    const prev = view.state;
    view.state = { doc: mockDocument(), selection: { head: 1, eq: () => false } };
    pluginView?.update?.(view as unknown as EditorView, prev as never);
    pluginView?.destroy?.();
    vi.advanceTimersByTime(300);
    expect(onChange).not.toHaveBeenCalled();

    vi.useRealTimers();
    editorDom.remove();
  });
});
