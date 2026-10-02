/**
 * 复测阶段编排（issue #234）——纯函数，供 benchmark.mjs 与本目录单测共用。
 *
 * 拆出来的理由与 cli-env 一致：编排分支（"该跑哪些阶段"）是判定链最上游的决策，
 * 一旦写错会让"没复测"被当成"没回归"。把它做成纯函数，语义就能被单测直接锁死，
 * 而不需要起浏览器。
 *
 * action 语义：
 * - `"measure"`：只做 测量 + check。本 job 产出 `raw/` 与 `retest.json` 后退出，
 *   final 判定交给独立 job 在新 runner 上跑（`handoff === true`）。
 * - `"all"`：单 job 全流程（测 → check → 有嫌疑则复测 → final）。常规运行走这条，
 *   不额外付一个 job 的启动与安装成本。
 * - `"retest"`：复测 job（`PERF_RETEST_ONLY=1`）。跳过测量与 check，
 *   直接用上游产物里的 `raw/` 与 `retest.json` 做（复测 +）final。
 *
 * 为什么要有"移交"这一档：首轮与复测在同一台 runner 上顺序执行时，
 * 「整台 runner 变慢」（共享宿主机争用 / VM 放置差异）会让两轮同时超阈值，
 * 穿过「连续 2 次」判定——实测一次慢会话里 88% 的相对行同时变差、中位 Δ +18.7%，
 * 而同一份代码在安静时段测得完全正常。换 runner 后两轮才统计独立。
 */
export function planRetestPhases({ splitRetest, retestOnly, suspects }) {
  const count = Array.isArray(suspects) ? suspects.length : 0;
  if (retestOnly) return { action: "retest", suspects: count, handoff: false };
  if (splitRetest && count > 0) return { action: "measure", suspects: count, handoff: true };
  return { action: "all", suspects: count, handoff: false };
}

/**
 * 确认轮（第三轮）编排（issue #294）——纯函数，供 benchmark.mjs 与单测共用。
 *
 * ## 为什么需要第三轮
 *
 * `planRetestPhases` 解决的是「两轮不同 runner」，但**两个会话可以同时被拖慢**：
 * 共享 runner 池内跨工作流的并发（自家 Build/test、打包、其他 Benchmark）会让
 * 同一次测量窗口里的两台 VM 一起变慢，于是 `FAIL ⟺ R1 ∧ R2` 成立而结论是错的
 * （2026-09-30 实证 3 例，换 runner 静默复跑全部证伪）。
 * 根治办法是：FAIL 必须由**第三个独立 runner** 上的会话确认。
 *
 * ## action 语义
 *
 * - `"handoff"`：有确认候选且本次运行处在拆分编排里 → 本 job 只做
 *   （复测 + confirm），把「测确认轮 + final」移交下一个 job 在新 runner 上跑。
 * - `"finalize"`：没有确认候选（或本地单进程）→ 本 job 自己跑完剩余阶段并出 final。
 *
 * ⚠️ `splitRetest: false`（本地单进程 `pnpm run benchmark`）时**不采纳** handoff：
 * 本地没有下一个 job，硬要移交等于「有候选但不判出结论」。此时有候选就在
 * **同一进程**里跑第三轮（与 R2 同样的同 runner 限制，D7 保持现状口径）。
 */
export function planConfirmPhases({ splitRetest, candidates }) {
  const count = Array.isArray(candidates) ? candidates.length : 0;
  // retest2Only（PERF_RETEST2_ONLY=1）本身就是「下一个 job」：候选必然非空，
  // 交给上游决定是否起第三个 job，本函数不参与该分支。
  if (splitRetest && count > 0) return { action: "handoff", candidates: count, handoff: true };
  return { action: "finalize", candidates: count, handoff: false };
}
