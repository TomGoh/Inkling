// 会话标定负载的单元测试（issue #236）
//
// 标定负载是"与编辑器代码无关的固定工作量"，用来把「机器慢」从「代码回归」里分开。
// 这里锁死采集器的语义（多轮取中位数、未采集时**不伪造 0**），因为它的输出会进基线、
// 参与"环境异常"判定——伪造 0 会让一次没测到的运行看起来像"机器变快了"。

import { describe, expect, it } from "vitest";
import { createSessionProbe, PROBE_LOOP_ITERS, PROBE_NODES, runSessionProbe } from "../perf/metrics.js";

/** 假页面：每次 evaluate 依次返回给定的标定结果 */
function fakePage(results: Array<{ layoutMs: number; cpuMs: number }>) {
  let i = 0;
  return {
    calls: () => i,
    evaluate: async () => results[Math.min(i++, results.length - 1)],
  };
}

describe("会话标定采集器（#236）", () => {
  it("多轮取中位数成标量：probeMs = 中位布局 + 中位 CPU", async () => {
    const probe = createSessionProbe();
    const page = fakePage([
      { layoutMs: 10, cpuMs: 100 },
      { layoutMs: 30, cpuMs: 300 },
      { layoutMs: 20, cpuMs: 200 },
    ]);
    await probe.measure(page);
    await probe.measure(page);
    await probe.measure(page);

    expect(page.calls()).toBe(3);
    expect(probe.scalars()).toEqual({
      probeLayoutMs: 20,
      probeCpuMs: 200,
      probeMs: 220,
    });
  });

  it("一次都没测到时返回空对象，不伪造 0（否则会伪装成「机器变快了」）", () => {
    const probe = createSessionProbe();
    expect(probe.scalars()).toEqual({});
  });

  it("标定工作量是写死的常量（可变的话标定值本身就不可比）", () => {
    expect(PROBE_NODES).toBe(1500);
    expect(PROBE_LOOP_ITERS).toBe(20_000_000);
  });

  it("页内函数体里的字面量与常量同步：只改一处会当场失败（评审 P1-1）", () => {
    // 页内函数经 page.evaluate 序列化执行，**拿不到模块常量**，所以工作量在函数体里又写了一遍。
    // 之前只断言了常量本身，改函数体一处、忘改常量时全套门禁照样全绿——那是虚的守卫。
    // 这里直接读函数源码，把两处字面量与常量钉在一起。
    //
    // 用数值比对而不是字符串比对：转译会把 `20_000_000` 压成 `2e7`（实测踩到），
    // 字符串断言会被这种等价形式误判为"不一致"。
    const src = runSessionProbe.toString();
    const num = (name: string): number => {
      const m = new RegExp(`const ${name} = ([0-9_.eE+-]+);`).exec(src);
      expect(m, `页内函数体缺少 const ${name} = <字面量>;`).not.toBeNull();
      return Number(m![1]);
    };
    expect(num("nodes")).toBe(PROBE_NODES);
    expect(num("iters")).toBe(PROBE_LOOP_ITERS);
  });
});
