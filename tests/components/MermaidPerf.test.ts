import { describe, it, expect, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockImplementation(async (id: string, text: string) => {
      // 模拟渲染延迟
      await new Promise((r) => setTimeout(r, 40));
      return { svg: `<svg id="${id}"><text>${text}</text></svg>` };
    }),
  },
}));

import { renderMermaidWithSeq } from "../../src/components/Editor/mermaid-view";

describe("Mermaid 渲染并发与 renderSeq 中断保护", () => {
  it("快速发起多次渲染时，旧渲染结果不会覆盖新结果", async () => {
    let currentSeq = 0;
    const renderedTexts: string[] = [];

    const trigger = async (code: string) => {
      const seq = ++currentSeq;
      const svg = await renderMermaidWithSeq(code, seq, () => currentSeq);
      if (svg) {
        renderedTexts.push(svg);
      }
    };

    const p1 = trigger("graph TD; A-->B;");
    const p2 = trigger("graph TD; A-->C;");
    const p3 = trigger("graph TD; A-->D;");

    await Promise.all([p1, p2, p3]);

    // 只有最新的 seq (p3) 成功写入，前两次在完成时发现 currentSeq 已更新而被废弃
    expect(renderedTexts).toHaveLength(1);
    expect(renderedTexts[0]).toContain("graph TD; A-->D;");
  });
});
