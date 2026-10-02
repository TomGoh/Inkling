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

/**
 * 运行模式（issue #294）——从环境变量读出「本次扮演哪个 job」。
 *
 * ## 为什么要抽成纯函数
 *
 * #294 首版评审的 P0 是：工作流的 `retest` job 漏了 `PERF_SPLIT_RETEST=1`，
 * 于是 `planConfirmPhases` 永远收到 `splitRetest=false` → 确认轮从不移交 →
 * 第三轮跑在**与 R2 同一台 runner** 上。tag 运行因此以「同 runner 三轮」的假 FAIL 收尾，
 * 而 retest2 job 又因上游非零被 skip——**根治手段在 tag 路径上被整体旁路**。
 *
 * 那个 bug 之所以能穿过全部关卡：`planConfirmPhases` 的单测是对的
 * （它只断言「`splitRetest:true` 时会 handoff」），坏的是**没人断言工作流真的会传这个变量**。
 * 把「环境 → 模式」也变成可单测的纯函数后，缺口就补上了：
 * 本函数锁住「`PERF_RETEST_ONLY=1` 的 job 必须同时带 `PERF_SPLIT_RETEST=1` 才移交」，
 * 而 benchmark.yml 那一行由 `perf-orchestration.test.ts` 直接读 YAML 断言。
 *
 * ## 三种模式互斥（优先级从高到低）
 *
 * | mode | 触发 | 含义 |
 * |---|---|---|
 * | `retest2` | `PERF_RETEST2_ONLY=1` | 确认轮 job：只做 R3 + final |
 * | `retest` | `PERF_RETEST_ONLY=1` | 复测 job：R2 + confirm（+ 可能移交） |
 * | `measure` | 其余 | 测量轮（或本地单进程）：R1 + check（+ 可能移交） |
 *
 * ⚠️ `retest2` 必须排在 `retest` 之前：两个变量同时为真时，
 * 确认轮 job 的语义（只补第三轮）更具体，先匹配它。
 */
export function resolveRunMode(env = {}) {
  if (env.PERF_RETEST2_ONLY === "1") return "retest2";
  if (env.PERF_RETEST_ONLY === "1") return "retest";
  return "measure";
}

/**
 * 本次运行「处在拆分编排里吗」——决定要不要把 final 移交给下一个 job。
 *
 * ⚠️ 只有**前两个** job 由工作流传 `PERF_SPLIT_RETEST=1`（P0 的教训）：
 * - `measure` job：传了才会在有嫌疑时移交复测；
 * - `retest` job：**传了才会在有确认候选时移交确认轮**（漏掉就是 P0——
 *   确认轮会退化成与 R2 同 runner，tag 发版验证以假 FAIL 收尾）。
 *
 * `retest2`（确认轮）是**最后一个 job**，在 `planRetestPhases` / `planConfirmPhases`
 * 之前就 `process.exit` 了，**不参与任何移交决策**——工作流刻意**不传**该变量，
 * `perf-orchestration.test.ts` 也断言它不设。别"顺手补上"：那既无作用，
 * 又会让守卫测试当场变红（文档要求一个测试禁止的动作 = 陷阱）。
 *
 * 本地单进程（`pnpm run benchmark`，不带任何 PERF_*_ONLY）返回 false，
 * 三轮在同一进程内顺序跑完——与 D7 的既有口径一致（同 runner 限制照旧，只是本地便利通道）。
 */
export function isSplitPipeline(env = {}) {
  return env.PERF_SPLIT_RETEST === "1";
}
