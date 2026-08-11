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
