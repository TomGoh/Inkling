// Mermaid 图表缩放与拖动平移测试
// 验证 v1.2.5 新增的拖动平移功能：
// - Ctrl+滚轮缩放后（zoom > 1），按住鼠标拖动平移图表
// - zoom = 1 时不可拖动（图表完整显示）
// - 编辑模式下不响应拖动
// - 双击 zoom > 1 时重置缩放与平移；zoom = 1 时进入编辑
// - 重新渲染图表时重置平移（保留缩放）
// - destroy 清理 window 监听器
//
// 测试通过 mock mermaid 模块避免引入真实渲染，直接验证 DOM transform 与事件行为。

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMermaidView } from "../../src/components/Editor/mermaid-view";
import type { Node } from "@milkdown/kit/prose/model";
import type { NodeView } from "@milkdown/kit/prose/view";

// mock mermaid：render 返回固定 svg，initialize 空实现
vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async (_id: string, _code: string) => ({
      svg: '<svg id="test-svg" width="100" height="100"></svg>',
    })),
  },
}));

// mock Tauri 环境（避免 isTauri 走真实路径）
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));
vi.mock("../../lib/fs", () => ({ writeBinaryFile: vi.fn() }));

// v2.3.1 起 mermaid 图表改为视口懒渲染；happy-dom 的 IntersectionObserver
// 不会触发回调，stub 为「observe 即进入视口」，保持创建即渲染的测试契约
(globalThis as any).IntersectionObserver = vi.fn((cb: (entries: any[]) => void) => ({
  observe: (target: Element) => cb([{ isIntersecting: true, target }]),
  disconnect: vi.fn(),
  unobserve: vi.fn(),
}));

// 构造假 ProseMirror Node
function makeFakeNode(textContent = "graph TD; A-->B"): Node {
  return {
    type: { name: "code_block" },
    attrs: { language: "mermaid" },
    textContent,
    nodeSize: textContent.length + 2,
  } as unknown as Node;
}

// 构造假 EditorView
function makeFakeView(): { view: any; dispatch: ReturnType<typeof vi.fn> } {
  const dispatch = vi.fn();
  const view = {
    state: {
      schema: { text: vi.fn((s: string) => ({ text: s })) },
      tr: {
        replaceWith: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
      },
    },
    dispatch,
  };
  return { view, dispatch };
}

// 辅助：等待 mermaid.render 的 Promise resolve（render 是 async）
async function waitForRender() {
  // mermaid.render 是 async，createMermaidView 内 void render(...)，
  // 等一个 microtask + setTimeout(0) 让 render 完成
  await new Promise((r) => setTimeout(r, 0));
}

// 辅助：派发 wheel 事件缩放
// happy-dom 的 WheelEvent 构造函数对 ctrlKey/metaKey 选项支持不稳定，
// 用 Object.defineProperty 强制设置确保监听器内 e.ctrlKey === true
function wheelZoom(el: HTMLElement, deltaY: number, ctrlKey = true) {
  const event = new WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true });
  Object.defineProperty(event, "ctrlKey", { value: ctrlKey, configurable: true });
  Object.defineProperty(event, "metaKey", { value: false, configurable: true });
  el.dispatchEvent(event);
}

// 辅助：派发鼠标事件
function mouseDown(el: Element, clientX: number, clientY: number) {
  el.dispatchEvent(
    new MouseEvent("mousedown", { clientX, clientY, bubbles: true, cancelable: true }),
  );
}
function mouseMove(clientX: number, clientY: number) {
  window.dispatchEvent(
    new MouseEvent("mousemove", { clientX, clientY, bubbles: true, cancelable: true }),
  );
}
function mouseUp() {
  window.dispatchEvent(
    new MouseEvent("mouseup", { bubbles: true, cancelable: true }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  // 清理 window 上可能残留的监听器（每个测试的 NodeView 应自己 destroy）
});

describe("Mermaid 缩放与拖动平移", () => {
  it("初始渲染后 SVG transform 为 scale(1)（无平移）", async () => {
    const node = makeFakeNode();
    const { view } = makeFakeView();
    const nv: NodeView = createMermaidView(node, view as any, () => 0);
    await waitForRender();
    const svg = (nv.dom as HTMLElement).querySelector("svg")!;
    expect(svg.style.transform).toBe("translate(0px, 0px) scale(1)");
    nv.destroy?.();
  });

  it("Ctrl+滚轮放大后 transform 包含 scale > 1", async () => {
    const node = makeFakeNode();
    const { view } = makeFakeView();
    const nv: NodeView = createMermaidView(node, view as any, () => 0);
    await waitForRender();
    const container = nv.dom as HTMLElement;
    wheelZoom(container, -100); // 向上滚放大
    const svg = container.querySelector("svg")!;
    expect(svg.style.transform).toContain("scale(1.1)");
    nv.destroy?.();
  });

  it("放大后 pannable class 生效（cursor: grab）", async () => {
    const node = makeFakeNode();
    const { view } = makeFakeView();
    const nv: NodeView = createMermaidView(node, view as any, () => 0);
    await waitForRender();
    const container = nv.dom as HTMLElement;
    const diagram = container.querySelector(".mermaid-render")!;
    expect(diagram.classList.contains("pannable")).toBe(false);
    wheelZoom(container, -100);
    expect(diagram.classList.contains("pannable")).toBe(true);
    nv.destroy?.();
  });

  it("zoom=1 时 mousedown 不触发拖动（panX/panY 不变）", async () => {
    const node = makeFakeNode();
    const { view } = makeFakeView();
    const nv: NodeView = createMermaidView(node, view as any, () => 0);
    await waitForRender();
    const container = nv.dom as HTMLElement;
    const diagram = container.querySelector(".mermaid-render") as HTMLElement;
    mouseDown(diagram, 10, 10);
    mouseMove(50, 50);
    mouseUp();
    const svg = container.querySelector("svg")!;
    // 未放大时拖动无效果，transform 仍是 scale(1)
    expect(svg.style.transform).toBe("translate(0px, 0px) scale(1)");
    nv.destroy?.();
  });

  it("放大后拖动更新 panX/panY（transform 包含 translate）", async () => {
    const node = makeFakeNode();
    const { view } = makeFakeView();
    const nv: NodeView = createMermaidView(node, view as any, () => 0);
    await waitForRender();
    const container = nv.dom as HTMLElement;
    const diagram = container.querySelector(".mermaid-render") as HTMLElement;
    // 先放大
    wheelZoom(container, -100); // 1.1
    // 拖动：从 (100,100) 到 (150,130)
    mouseDown(diagram, 100, 100);
    mouseMove(150, 130);
    mouseUp();
    const svg = container.querySelector("svg")!;
    // panX 应 = 50, panY = 30
    expect(svg.style.transform).toContain("translate(50px, 30px)");
    expect(svg.style.transform).toContain("scale(1.1)");
    nv.destroy?.();
  });

  it("拖动中 diagram 添加 dragging class（cursor: grabbing）", async () => {
    const node = makeFakeNode();
    const { view } = makeFakeView();
    const nv: NodeView = createMermaidView(node, view as any, () => 0);
    await waitForRender();
    const container = nv.dom as HTMLElement;
    const diagram = container.querySelector(".mermaid-render") as HTMLElement;
    wheelZoom(container, -100);
    mouseDown(diagram, 0, 0);
    expect(diagram.classList.contains("dragging")).toBe(true);
    mouseMove(20, 20);
    mouseUp();
    expect(diagram.classList.contains("dragging")).toBe(false);
    nv.destroy?.();
  });

  it("mouseup 后停止拖动（后续 mousemove 不再更新 panX/panY）", async () => {
    const node = makeFakeNode();
    const { view } = makeFakeView();
    const nv: NodeView = createMermaidView(node, view as any, () => 0);
    await waitForRender();
    const container = nv.dom as HTMLElement;
    const diagram = container.querySelector(".mermaid-render") as HTMLElement;
    wheelZoom(container, -100);
    mouseDown(diagram, 0, 0);
    mouseMove(30, 40);
    mouseUp();
    const svg = container.querySelector("svg")!;
    const transformAfterUp = svg.style.transform;
    // mouseup 后再 move 不应改变 transform
    mouseMove(100, 100);
    expect(svg.style.transform).toBe(transformAfterUp);
    nv.destroy?.();
  });

  it("双击 zoom>1 时重置缩放与平移到 100%", async () => {
    const node = makeFakeNode();
    const { view } = makeFakeView();
    const nv: NodeView = createMermaidView(node, view as any, () => 0);
    await waitForRender();
    const container = nv.dom as HTMLElement;
    const diagram = container.querySelector(".mermaid-render") as HTMLElement;
    // 放大并拖动
    wheelZoom(container, -100);
    mouseDown(diagram, 0, 0);
    mouseMove(50, 60);
    mouseUp();
    // 双击重置
    container.dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true, cancelable: true }),
    );
    const svg = container.querySelector("svg")!;
    expect(svg.style.transform).toBe("translate(0px, 0px) scale(1)");
    expect(diagram.classList.contains("pannable")).toBe(false);
    nv.destroy?.();
  });

  it("双击 zoom=1 时进入编辑模式（不重置）", async () => {
    const node = makeFakeNode();
    const { view } = makeFakeView();
    const nv: NodeView = createMermaidView(node, view as any, () => 0);
    await waitForRender();
    const container = nv.dom as HTMLElement;
    // 双击（zoom=1）
    container.dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true, cancelable: true }),
    );
    // 编辑器 textarea 应显示
    const editor = container.querySelector(".mermaid-editor") as HTMLTextAreaElement;
    expect(editor.style.display).toBe("block");
    nv.destroy?.();
  });

  it("destroy 清理 window 监听器（拖动不再响应）", async () => {
    const node = makeFakeNode();
    const { view } = makeFakeView();
    const nv: NodeView = createMermaidView(node, view as any, () => 0);
    await waitForRender();
    const container = nv.dom as HTMLElement;
    const diagram = container.querySelector(".mermaid-render") as HTMLElement;
    wheelZoom(container, -100);
    nv.destroy?.();
    // destroy 后拖动不应更新 transform（监听器已移除）
    const svgBefore = container.querySelector("svg")!.style.transform;
    mouseDown(diagram, 0, 0);
    mouseMove(50, 50);
    mouseUp();
    expect(container.querySelector("svg")!.style.transform).toBe(svgBefore);
  });

  it("缩放范围夹在 [0.5, 3]", async () => {
    const node = makeFakeNode();
    const { view } = makeFakeView();
    const nv: NodeView = createMermaidView(node, view as any, () => 0);
    await waitForRender();
    const container = nv.dom as HTMLElement;
    // 持续放大到顶
    for (let i = 0; i < 30; i++) wheelZoom(container, -100);
    expect(container.querySelector("svg")!.style.transform).toContain("scale(3)");
    // 持续缩小到底
    for (let i = 0; i < 40; i++) wheelZoom(container, 100);
    expect(container.querySelector("svg")!.style.transform).toContain("scale(0.5)");
    nv.destroy?.();
  });
});
