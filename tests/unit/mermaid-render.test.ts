// Mermaid 渲染配置测试（v2.0.1 防多行节点文字底部裁切）
//
// 背景：v2.0.0 渲染纵向业务流程图时，多个多行矩形节点（含 <br/> 换行 + 长
// 中文文本 + 自定义 style stroke-width:2px）出现文字底部被边框裁切、显示
// 不全；单行菱形判断框正常。根因为 line-height 继承放大 + 长文本回流触发
// 高度重算偏差 + 边框侵占内部高度，三者叠加。
//
// 本测试不引入真实 mermaid 渲染，而是：
// 1. 断言导出的 MERMAID_CONFIG 含防裁切的关键配置
// 2. 断言 mermaid.initialize 被以该 config 调用
// 3. 用用户报告的原样流程图代码验证 createMermaidView 正常渲染（不抛错）

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMermaidView, MERMAID_CONFIG } from "../../src/components/Editor/mermaid-view";
import type { Node, NodeView } from "@milkdown/kit/prose/model";
import mermaid from "mermaid";

// mock mermaid：initialize 空实现，render 返回固定 svg
// （本测试关注配置与调用契约，不引入真实渲染）
vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async (_id: string, _code: string) => ({
      svg: '<svg id="test-svg" width="100" height="100"></svg>',
    })),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));
vi.mock("../../lib/fs", () => ({ writeBinaryFile: vi.fn() }));

// 用户报告出现裁切的原始流程图代码（保留 <br/> 多行 + style 加粗边框）
const MULTI_LINE_FLOWCHART = `flowchart TB
    A["① 请求进入<br/>A2A Task / 调试界面"] --> B["② 加载 Agent Definition<br/>prompt + 工具列表 + 知识库列表"]
    B --> C["③ Context Builder 组装上下文<br/>system_prompt + 历史对话 + 用户输入 + 工具Schema"]
    C --> D["④ 调用 LLM 推理"]
    D --> E{"需要工具？"}
    E -- 是 --> F["⑤ 通过 MCP Client 调用对应 MCP Server<br/>知识库检索也是走这里"]
    F --> G["⑥ 工具/检索结果写回上下文"]
    G --> D
    E -- 否 --> H["⑦ 返回最终答案<br/>写入 Session Store + A2A Task 返回"]

    style D fill:#eef2ff,stroke:#4f46e5,stroke-width:2px
    style F fill:#e0f2fe,stroke:#0ea5e9,stroke-width:2px`;

function makeFakeNode(textContent: string): Node {
  return {
    type: { name: "code_block" },
    attrs: { language: "mermaid" },
    textContent,
    nodeSize: textContent.length + 2,
  } as unknown as Node;
}

function makeFakeView() {
  return {
    state: {
      schema: { text: vi.fn((s: string) => ({ text: s })) },
      tr: { replaceWith: vi.fn().mockReturnThis(), delete: vi.fn().mockReturnThis() },
    },
    dispatch: vi.fn(),
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MERMAID_CONFIG 防裁切配置", () => {
  it("flowchart.htmlLabels 为 true（保留 <br/> 多行换行能力）", () => {
    expect(MERMAID_CONFIG.flowchart?.htmlLabels).toBe(true);
  });

  it("flowchart.padding >= 18（加大节点内边距，给多行文字留呼吸空间）", () => {
    expect(MERMAID_CONFIG.flowchart?.padding).toBeGreaterThanOrEqual(18);
  });

  it("flowchart.useMaxWidth 为 false（不按容器宽度缩放回流，避免高度重算偏差）", () => {
    expect(MERMAID_CONFIG.flowchart?.useMaxWidth).toBe(false);
  });

  it("themeVariables.fontSize 已锁定（避免继承编辑器大字号导致测量与渲染不一致）", () => {
    expect(MERMAID_CONFIG.themeVariables?.fontSize).toBeTruthy();
  });
});

describe("mermaid.initialize 调用", () => {
  it("createMermaidView 触发 mermaid.initialize 并传入防裁切配置", async () => {
    const node = makeFakeNode("graph TD; A-->B");
    const nv: NodeView = createMermaidView(node, makeFakeView(), () => 0);
    await new Promise((r) => setTimeout(r, 0));
    expect(mermaid.initialize).toHaveBeenCalledWith(MERMAID_CONFIG);
    nv.destroy?.();
  });

  it("多次创建 NodeView 不重复初始化（懒初始化，initialized 模块级单例）", async () => {
    // 注意：initialized 是 mermaid-view.ts 模块级变量，在同一测试文件中
    // 前面用例已触发 ensureInit() 将其置 true，故此处验证多次 createMermaidView
    // 调用后 initialize 调用次数不增长（懒初始化契约）。
    const initMock = mermaid.initialize as ReturnType<typeof vi.fn>;
    const before = initMock.mock.calls.length;
    const view = makeFakeView();
    const nv1 = createMermaidView(makeFakeNode("graph TD; A-->B"), view, () => 0);
    const nv2 = createMermaidView(makeFakeNode("graph TD; C-->D"), view, () => 0);
    const nv3 = createMermaidView(makeFakeNode("graph TD; E-->F"), view, () => 0);
    await new Promise((r) => setTimeout(r, 0));
    // 新增 3 个 NodeView 后，initialize 调用次数应保持不变（不再重复初始化）
    expect(initMock.mock.calls.length).toBe(before);
    nv1.destroy?.();
    nv2.destroy?.();
    nv3.destroy?.();
  });
});

describe("多行流程图渲染（用户报告的裁切场景）", () => {
  it("渲染含 <br/> + style stroke-width:2px 的多行节点流程图不抛错", async () => {
    const node = makeFakeNode(MULTI_LINE_FLOWCHART);
    const nv: NodeView = createMermaidView(node, makeFakeView(), () => 0);
    await new Promise((r) => setTimeout(r, 0));
    // mermaid.render 被 mock 返回固定 svg，应正常注入 diagram
    const svg = (nv.dom as HTMLElement).querySelector("svg");
    expect(svg).toBeTruthy();
    nv.destroy?.();
  });

  it("渲染后将 SVG 写入 .mermaid-render 容器", async () => {
    const node = makeFakeNode(MULTI_LINE_FLOWCHART);
    const nv: NodeView = createMermaidView(node, makeFakeView(), () => 0);
    await new Promise((r) => setTimeout(r, 0));
    const diagram = (nv.dom as HTMLElement).querySelector(".mermaid-render")!;
    expect(diagram.querySelector("svg")).toBeTruthy();
    nv.destroy?.();
  });

  it("mermaid.render 收到原始流程图代码（含 <br/> 与 style 不被篡改）", async () => {
    const node = makeFakeNode(MULTI_LINE_FLOWCHART);
    const nv: NodeView = createMermaidView(node, makeFakeView(), () => 0);
    await new Promise((r) => setTimeout(r, 0));
    const renderCalls = (mermaid.render as ReturnType<typeof vi.fn>).mock.calls;
    const lastCodeArg = renderCalls[renderCalls.length - 1]?.[1];
    expect(lastCodeArg).toBe(MULTI_LINE_FLOWCHART);
    nv.destroy?.();
  });
});
