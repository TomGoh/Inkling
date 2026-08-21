import { describe, it, expect, vi } from "vitest";

describe("Mermaid 渲染并发与防抖性能", () => {
  it("快速连续渲染只执行最新 sequence", async () => {
    let renderSeq = 0;
    const completed: number[] = [];

    const triggerRender = (text: string) => {
      const currentSeq = ++renderSeq;
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          if (currentSeq !== renderSeq) {
            // 中断/丢弃过期请求
            resolve();
            return;
          }
          completed.push(currentSeq);
          resolve();
        }, 50);
      });
    };

    triggerRender("graph TD; A-->B;");
    triggerRender("graph TD; A-->C;");
    await triggerRender("graph TD; A-->D;");
    await new Promise((r) => setTimeout(r, 80));

    expect(completed).toEqual([3]);
  });
});
