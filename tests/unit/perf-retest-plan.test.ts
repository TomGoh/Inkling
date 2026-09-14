// 复测阶段编排的单测（issue #234）
//
// 背景：首轮与复测在同一台 runner 上顺序执行时，「整台 runner 变慢」会让两轮同时超阈值、
// 穿过「连续 2 次」判定。修复方向是把复测与 final 判定拆到**独立 job（新 runner）**上跑。
// 编排分支一旦写错，后果是"没复测"被当成"没回归"——所以把决策抽成纯函数并在这里锁死。

import { describe, expect, it } from "vitest";
import { planRetestPhases } from "../perf/retest-plan.js";

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
