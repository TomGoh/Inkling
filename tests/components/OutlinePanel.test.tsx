import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OutlinePanel } from "../../src/components/Outline/OutlinePanel";
import type {
  EditorOutlineHeading,
  EditorOutlineSnapshot,
} from "../../src/lib/outline";

function rect(top: number, bottom: number): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    bottom,
    left: 0,
    right: 220,
    width: 220,
    height: bottom - top,
    toJSON: () => ({}),
  } as DOMRect;
}

function snapshot(activeIndex: number): EditorOutlineSnapshot {
  const headings: EditorOutlineHeading[] = Array.from(
    { length: 12 },
    (_, index) => ({
      index,
      level: 2,
      text: `标题 ${index + 1}`,
      pos: index * 10,
      nodeId: null,
      id: `h-${index}`,
    }),
  );
  return { headings, activeIndex };
}

describe("OutlinePanel 自动跟随", () => {
  it("当前项低于可视区时以最短距离滚入视图", () => {
    let frame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function () {
        if (this.classList.contains("outline-tree")) return rect(100, 300);
        if (this.classList.contains("outline-item-active")) return rect(330, 350);
        return rect(0, 0);
      });

    const { container } = render(
      <OutlinePanel getEditor={() => undefined} snapshot={snapshot(11)} />,
    );
    const tree = container.querySelector<HTMLElement>(".outline-tree")!;
    Object.defineProperties(tree, {
      scrollTop: { value: 40, writable: true },
      scrollHeight: { value: 1000 },
      clientHeight: { value: 200 },
    });
    const scrollTo = vi.fn();
    tree.scrollTo = scrollTo;

    act(() => frame?.(0));

    expect(scrollTo).toHaveBeenCalledWith({ top: 94, behavior: "smooth" });
  });

  it("当前项已经可见时不改变大纲滚动位置", () => {
    let frame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function () {
        if (this.classList.contains("outline-tree")) return rect(100, 300);
        if (this.classList.contains("outline-item-active")) return rect(150, 174);
        return rect(0, 0);
      });

    const { container } = render(
      <OutlinePanel getEditor={() => undefined} snapshot={snapshot(4)} />,
    );
    const tree = container.querySelector<HTMLElement>(".outline-tree")!;
    const scrollTo = vi.fn();
    tree.scrollTo = scrollTo;

    act(() => frame?.(0));

    expect(scrollTo).not.toHaveBeenCalled();
  });
});
