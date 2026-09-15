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
