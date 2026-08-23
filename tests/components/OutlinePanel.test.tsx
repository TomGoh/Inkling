import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OutlinePanel } from "../../src/components/Outline/OutlinePanel";
import { useOutline } from "../../src/store/outline";
import { useWorkspace } from "../../src/store/workspace";
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

function renderPanel() {
  const utils = render(<OutlinePanel getEditor={() => undefined} />);
  return utils;
}

function publish(activeIndex: number) {
  act(() => {
    useOutline.getState().publish("/test.md", snapshot(activeIndex));
  });
}

beforeEach(() => {
  useWorkspace.setState({ currentFile: "/test.md" });
  act(() => {
    useOutline.getState().publish("/test.md", { headings: [], activeIndex: null });
  });
});

describe("OutlinePanel 自动跟随", () => {
  it("当前项可居中时即使已经可见也滚动到中央", () => {
    let frame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains("outline-tree")) return rect(100, 300);
        if (this.classList.contains("outline-item-active")) return rect(230, 250);
        return rect(0, 0);
      });

    const { container } = renderPanel();
    publish(6);
    const tree = container.querySelector<HTMLElement>(".outline-tree")!;
    Object.defineProperties(tree, {
      scrollTop: { value: 40, writable: true },
      scrollHeight: { value: 1000 },
      clientHeight: { value: 200 },
    });
    const scrollTo = vi.fn();
    tree.scrollTo = scrollTo;

    act(() => frame?.(0));

    expect(scrollTo).toHaveBeenCalledWith({ top: 80, behavior: "smooth" });
  });

  it("靠近开头时将目标位置钳制到顶部", () => {
    let frame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains("outline-tree")) return rect(100, 300);
        if (this.classList.contains("outline-item-active")) return rect(120, 140);
        return rect(0, 0);
      });

    const { container } = renderPanel();
    publish(1);
    const tree = container.querySelector<HTMLElement>(".outline-tree")!;
    Object.defineProperties(tree, {
      scrollTop: { value: 40, writable: true },
      scrollHeight: { value: 1000 },
      clientHeight: { value: 200 },
    });
    const scrollTo = vi.fn();
    tree.scrollTo = scrollTo;

    act(() => frame?.(0));

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });

  it("activeIndex 变化时复用列表项 DOM，仅切换 active 类", () => {
    // 滚动高频更新场景：headings 不变、activeIndex 变化时，
    // memo 化列表项应跳过重渲染，DOM 节点保持同一（issue #31）
    renderPanel();
    const headings: EditorOutlineHeading[] = Array.from(
      { length: 12 },
      (_, index) => ({
        index,
        level: 2,
        text: `标题 ${index + 1}`,
        pos: index * 10,
        nodeId: null,
        id: `m-${index}`,
      }),
    );
    act(() => {
      useOutline.getState().publish("/test.md", { headings, activeIndex: 0 });
    });
    const first = Array.from(document.querySelectorAll(".outline-item"));
    expect(first).toHaveLength(12);

    act(() => {
      useOutline.getState().publish("/test.md", { headings, activeIndex: 5 });
    });
    const second = Array.from(document.querySelectorAll(".outline-item"));
    expect(second).toHaveLength(12);
    second.forEach((el, i) => expect(el).toBe(first[i]));
    expect(second[5].classList.contains("outline-item-active")).toBe(true);
    expect(first[0].classList.contains("outline-item-active")).toBe(false);
  });

  it("靠近末尾时将目标位置钳制到底部", () => {
    let frame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains("outline-tree")) return rect(100, 300);
        if (this.classList.contains("outline-item-active")) return rect(270, 290);
        return rect(0, 0);
      });

    const { container } = renderPanel();
    publish(11);
    const tree = container.querySelector<HTMLElement>(".outline-tree")!;
    Object.defineProperties(tree, {
      scrollTop: { value: 780, writable: true },
      scrollHeight: { value: 1000 },
      clientHeight: { value: 200 },
    });
    const scrollTo = vi.fn();
    tree.scrollTo = scrollTo;

    act(() => frame?.(0));

    expect(scrollTo).toHaveBeenCalledWith({ top: 800, behavior: "smooth" });
  });
});
