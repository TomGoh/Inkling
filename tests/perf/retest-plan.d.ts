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

export type ConfirmAction = "handoff" | "finalize";

export interface ConfirmPlan {
  /** 本次要执行的编排：移交下一个 job，或就地跑完并出 final */
  action: ConfirmAction;
  /** 确认轮候选场景数 */
  candidates: number;
  /** 是否把「测确认轮 + final」移交独立 job（仅 action === "handoff" 时为 true） */
  handoff: boolean;
}

/**
 * 决定确认轮（第三轮）该怎么走（issue #294）。
 * - splitRetest：本次运行处在拆分编排里（CI 复测 job）。本地单进程为 false，
 *   此时有候选也在同进程内跑第三轮——本地没有下一个 job 可移交。
 * - candidates：`--phase=confirm` 产出的确认轮候选清单
 */
export function planConfirmPhases(input: {
  splitRetest: boolean;
  candidates?: string[];
}): ConfirmPlan;

/** 本次运行扮演哪个 job（issue #294）：measure | retest | retest2 */
export type RunMode = "measure" | "retest" | "retest2";

/**
 * 从环境变量解析运行模式（issue #294）。
 * `PERF_RETEST2_ONLY=1` 优先于 `PERF_RETEST_ONLY=1`（同时为真时确认轮语义更具体）。
 */
export function resolveRunMode(env?: Record<string, string | undefined>): RunMode;

/**
 * 本次运行是否处在拆分编排里（决定要不要把 final 移交给下一个 job）。
 *
 * ⚠️ 三个 CI job 都**必须**由工作流显式传 `PERF_SPLIT_RETEST=1`：
 * `retest` job 漏传会让确认轮永不移交（#294 评审 P0：第三轮退化成与 R2 同 runner，
 * tag 运行以假 FAIL 收尾）。本地单进程不带该变量，返回 false。
 */
export function isSplitPipeline(env?: Record<string, string | undefined>): boolean;
