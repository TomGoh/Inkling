export type RetestAction = "measure" | "all" | "retest";

export interface RetestPlan {
  /** 本次要执行的阶段组合 */
  action: RetestAction;
  /** 复测清单长度 */
  suspects: number;
  /** 是否把 final 判定移交给独立 job（仅 action === "measure" 时为 true） */
  handoff: boolean;
}

/**
 * 决定本次运行该跑哪些阶段（issue #234）。
 * - splitRetest：工作流设置的 PERF_SPLIT_RETEST=1（有嫌疑则移交独立 job）
 * - retestOnly：工作流设置的 PERF_RETEST_ONLY=1（本 job 就是那个复测 job）
 * - suspects：复测清单（benchmark.mjs 里可能被 PERF_FORCE_SUSPECTS 测试钩子覆盖）
 */
export function planRetestPhases(input: {
  splitRetest: boolean;
  retestOnly: boolean;
  suspects?: string[];
}): RetestPlan;
