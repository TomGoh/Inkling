// 复测阶段编排的单测（issue #234）
//
// 背景：首轮与复测在同一台 runner 上顺序执行时，「整台 runner 变慢」会让两轮同时超阈值、
// 穿过「连续 2 次」判定。修复方向是把复测与 final 判定拆到**独立 job（新 runner）**上跑。
// 编排分支一旦写错，后果是"没复测"被当成"没回归"——所以把决策抽成纯函数并在这里锁死。

import { describe, expect, it } from "vitest";
import { planConfirmPhases, planRetestPhases } from "../perf/retest-plan.js";

describe("复测阶段编排（#234：复测必须换 runner）", () => {
  it("常规运行（未拆 job）：测 → check →（复测）→ final 都在同一 job 内", () => {
    expect(planRetestPhases({ splitRetest: false, retestOnly: false, suspects: [] })).toEqual({
      action: "all",
      suspects: 0,
      handoff: false,
    });
    expect(
      planRetestPhases({ splitRetest: false, retestOnly: false, suspects: ["scroll-M-rich"] }),
    ).toEqual({ action: "all", suspects: 1, handoff: false });
  });

  it("拆 job 但无嫌疑：就地出 final，不额外起 job（常规运行不付启动成本）", () => {
    expect(planRetestPhases({ splitRetest: true, retestOnly: false, suspects: [] })).toEqual({
      action: "all",
      suspects: 0,
      handoff: false,
    });
  });

  it("拆 job 且有嫌疑：本 job 只测 + check，final 移交独立 job（handoff=true）", () => {
    expect(
      planRetestPhases({ splitRetest: true, retestOnly: false, suspects: ["scroll-M-rich", "search-M-rich"] }),
    ).toEqual({ action: "measure", suspects: 2, handoff: true });
  });

  it("复测 job：跳过测量与 check，直接用上游产物做（复测 +）final", () => {
    expect(planRetestPhases({ splitRetest: false, retestOnly: true, suspects: ["scroll-M-rich"] })).toEqual({
      action: "retest",
      suspects: 1,
      handoff: false,
    });
    // 复测清单为空也照样进 retest：此时只出 final（相关行落 WARN「未复测」），不能再移交
    expect(planRetestPhases({ splitRetest: false, retestOnly: true, suspects: [] })).toEqual({
      action: "retest",
      suspects: 0,
      handoff: false,
    });
  });

  it("retestOnly 优先于 splitRetest：复测 job 不能再把复测移交出去（否则无限接力）", () => {
    const plan = planRetestPhases({ splitRetest: true, retestOnly: true, suspects: ["a"] });
    expect(plan.action).toBe("retest");
    expect(plan.handoff).toBe(false);
  });

  it("suspects 缺省/非数组时不炸：按「无嫌疑」处理", () => {
    expect(planRetestPhases({ splitRetest: true, retestOnly: false }).action).toBe("all");
    expect(planRetestPhases({ splitRetest: true, retestOnly: false }).suspects).toBe(0);
  });
});

// 确认轮（第三轮）编排（#294）：FAIL 必须由第三个独立 runner 确认。
//
// #234 把复测拆到新 runner 挡住了「单会话慢」，但挡不住**两个会话同时被拖慢**——
// 共享 runner 池内跨工作流的并发（自家 Build/test、打包、其他 Benchmark）会让
// 同一测量窗口里的两台 VM 一起变慢，双超阈值成立而结论是错的。
// 编排分支写错的后果：要么「该确认却没确认」（假 FAIL 复发），要么「没候选也起 job」（白付成本）。
describe("确认轮阶段编排（#294：FAIL 必须由第三个 runner 确认）", () => {
  it("CI 复测 job + 有确认候选 → 移交独立 job 在第三个 runner 上跑", () => {
    expect(planConfirmPhases({ splitRetest: true, candidates: ["scroll-M-rich"] })).toEqual({
      action: "handoff",
      candidates: 1,
      handoff: true,
    });
  });

  it("CI 复测 job + 无候选 → 就地出 final（常规路径零额外开销）", () => {
    expect(planConfirmPhases({ splitRetest: true, candidates: [] })).toEqual({
      action: "finalize",
      candidates: 0,
      handoff: false,
    });
  });

  it("本地单进程 + 有候选 → 仍 finalize：本地没有下一个 job，硬移交等于不判结论", () => {
    // 这一条最容易写错：本地流程固定是 R1→R2→R3→final，硬要 handoff 会让
    // 「有候选」变成「永远不出结论」。
    const plan = planConfirmPhases({ splitRetest: false, candidates: ["scroll-M-rich"] });
    expect(plan.action).toBe("finalize");
    expect(plan.candidates).toBe(1);
    expect(plan.handoff).toBe(false);
  });

  it("本地单进程 + 无候选 → finalize（两轮直接出结论）", () => {
    expect(planConfirmPhases({ splitRetest: false, candidates: [] })).toEqual({
      action: "finalize",
      candidates: 0,
      handoff: false,
    });
  });

  it("candidates 缺省/非数组时不炸：按「无候选」处理", () => {
    expect(planConfirmPhases({ splitRetest: true }).action).toBe("finalize");
    expect(planConfirmPhases({ splitRetest: true }).candidates).toBe(0);
  });
});
