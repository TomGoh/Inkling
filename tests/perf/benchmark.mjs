#!/usr/bin/env node
// Benchmark 入口：多阶段编排 + 三态退出码（issue #216 / #234 / #294）
//
//   phase 1  playwright 全量跑 → raw 落盘 .perf-output/raw/
//   phase 2  report --phase=check → 产出「疑似回归场景」清单 retest.json
//   phase 3  清单非空 → 只跑清单里的场景，raw 落盘 .perf-output/raw-retest/
//   phase 4  report --phase=confirm → 产出「确认轮候选」清单 retest2.json
//   phase 5  候选非空 → 只跑候选场景，raw 落盘 .perf-output/raw-retest2/
//   phase 6  report --phase=final → 合并三轮判定，输出对比表与退出码
//
// 阶段可拆到**独立 job**（新 runner）执行，见 PERF_SPLIT_RETEST / PERF_RETEST_ONLY /
// PERF_RETEST2_ONLY 说明（issue #234 / #294）。
//
// 为什么"复测"必须由本脚本编排而不是 report.mjs 自己触发：
// report 运行时 Playwright 已经退出、浏览器已关闭，report 没有任何复测能力。
//
// 退出码三态（刻意区分，防"假绿灯"）：
//   0 = 跑完且无确认回归（含仅 WARN / 首次运行无 baseline / baseline 失效）
//   1 = 跑完且回归复现（**参与判定的每一轮都超阈值**，#294 至少三轮）
//   2 = 没测到（playwright 启动失败、场景缺失等 infra 故障）

import { spawn, execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildRunEnv,
  KNOWN_ARG_KEYS,
  parseArgs,
  unknownArgKeys,
} from "./cli-env.js";
import { planConfirmPhases, planRetestPhases } from "./retest-plan.js";

const OUT_DIR = resolve(".perf-output");
const CONFIG = "tests/perf/playwright.perf.config.ts";
const PW_CLI = resolve("node_modules/@playwright/test/cli.js");

const args = parseArgs(process.argv.slice(2));

// 未知参数直接报错退出：静默忽略正是 `--scenario` 曾经失效的成因
const unknownArgs = unknownArgKeys(args);
if (unknownArgs.length > 0) {
  console.error(
    `[perf] 未知参数：${unknownArgs.map((k) => `--${k}`).join(", ")}；` +
      `可用参数：${KNOWN_ARG_KEYS.map((k) => `--${k}`).join(", ")}`,
  );
  process.exit(2);
}

/** 参数同时支持 argv 与环境变量：绕开 npm/pnpm 在 `--` 透传上的差异 */
const profile = args.profile ?? process.env.PERF_PROFILE ?? "quick";
const repeat = args.repeat ?? process.env.PERF_REPEAT ?? "";
const scenario = args.scenario ?? process.env.PERF_SCENARIO ?? "";
const updateBaseline =
  (args["update-baseline"] ?? process.env.PERF_UPDATE_BASELINE ?? "") === "1";
const port = args.port ?? process.env.PERF_PORT ?? "1420";

function runCommand(cmdArgs, env) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, cmdArgs, {
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    child.on("exit", (code) => resolvePromise(code ?? 1));
    child.on("error", () => resolvePromise(1));
  });
}

function gitValue(cmd) {
  try {
    return execSync(cmd, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

/** 采集运行元信息写进报告，保证结果可追溯（同环境纵向对比的前提） */
async function collectMeta() {
  let chromium = "unknown";
  try {
    const { chromium: browserType } = await import("@playwright/test");
    chromium = browserType.executablePath();
  } catch {
    /* 拿不到就记 unknown，不因此让整条管线失败 */
  }
  return {
    gitSha: gitValue("git rev-parse HEAD").slice(0, 12),
    branch: gitValue("git rev-parse --abbrev-ref HEAD"),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    chromium,
    ci: process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true",
  };
}

/**
 * 读一份「场景 id 清单」产物（retest.json / retest2.json）。
 * 缺失或损坏一律按「空清单」处理：清单只是编排信号，读不到时**不得**改变判定结论，
 * 更不能因此把"没复测"读成"没回归"。
 */
function readIdList(fileName) {
  const file = resolve(OUT_DIR, fileName);
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 数一数某轮 raw 目录里落盘了几份采样（用于判断"整轮没测到"还是"部分场景没测到"） */
function countRawSamples(dir) {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((f) => f.endsWith(".json")).length;
}

async function main() {
  if (!existsSync(PW_CLI)) {
    console.error(`[perf] 未找到 Playwright CLI：${PW_CLI}`);
    process.exit(2);
  }

  const meta = await collectMeta();
  console.log(
    `[perf] profile=${profile} port=${port} env=${meta.ci ? "ci" : "local"} sha=${meta.gitSha}`,
  );

  // 元信息落盘，由 report.mjs 并入 latest.json：
  // 没有 git sha / 浏览器版本的结果无法追溯，也就无法支撑"同环境纵向对比"
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(resolve(OUT_DIR, "meta.json"), JSON.stringify(meta, null, 2), "utf8");

  // 全部参数统一走 buildRunEnv：任何"解析了却忘了往下传"的参数都会在这里暴露
  const baseEnv = buildRunEnv({ profile, port, repeat, scenario });

  // ---- 阶段编排（issue #234 / #294）----
  // 默认（单 job）：测 → check → 复测（同 runner）→ confirm →（有候选）确认轮（同 runner）→ final
  // `PERF_SPLIT_RETEST=1`：只做「测 + check」；有嫌疑就把清单交给独立 job 并在本 job 退出 0
  //   （工作流随后在新 runner 上跑 `PERF_RETEST_ONLY=1`）；无嫌疑则就地出 final 报告，不额外起 job。
  // `PERF_RETEST_ONLY=1`：跳过测量与 check，直接「复测 + confirm」（raw 与 retest.json 来自上游产物）；
  //   有确认候选则写 retest2.json 后移交，**不产 final**；无候选就地 final。
  // `PERF_RETEST2_ONLY=1`：只做「确认轮 + final」——R1/R2/候选清单/基线全部来自上游产物。
  // `PERF_FORCE_SUSPECTS=<id,id>`：测试钩子，覆盖复测清单，用于确定性地演练移交路径。
  // `PERF_FORCE_SUSPECTS2=<id,id>`：同上，覆盖**确认轮**候选清单（#294）——
  //   没有它，「三段路径」在 CI 上只能等真回归触发，无法回归测试。
  //
  // 为什么要拆 job：首轮与复测在同一台 runner 上顺序执行时，**整台 runner 变慢**（共享宿主机争用）
  // 会让两轮同时超阈值、穿过「连续 2 次」过滤——实测一次慢会话里 88% 的相对行同时变差、
  // 中位 Δ +18.7%，而同一份代码在安静时段测得完全正常。换 runner 后两轮才统计独立。
  // #294：换 runner 仍不够——**两个**会话可以同时被拖慢（跨工作流并发），所以需要第三个。
  // 具体该跑哪些阶段由 planRetestPhases / planConfirmPhases 纯函数决定（有单测锁语义）。
  const retestOnly = process.env.PERF_RETEST_ONLY === "1";
  const retest2Only = process.env.PERF_RETEST2_ONLY === "1";

  // raw 目录的清空策略按运行模式区分（#294）——**清错目录会直接毁掉上游产物**：
  // - 本轮要写的目录：每轮都清。残留样本会让判定读到上一轮的数据；
  //   raw 尤其要清，否则本次没跑到的场景（--scenario 过滤 / 已从 profiles 移除）
  //   会拿旧采样参与比较，报表里出现一堆 0.0% 的假 PASS。
  // - 本轮只读的目录（上游 job 的产物）：**绝不能清**。retest2 job 的 raw / raw-retest /
  //   retest2.json / 基线全部来自上游，清了就没得比了（final 会退化成两轮、把结论
  //   "假装成"已确认，或误报 UNCONFIRMED）。
  if (retest2Only) {
    // 确认轮 job：只清自己写的那一个目录，其余一律保留
    rmSync(resolve(OUT_DIR, "raw-retest2"), { recursive: true, force: true });
  } else {
    rmSync(resolve(OUT_DIR, "raw-retest"), { recursive: true, force: true });
    if (!retestOnly) {
      // 测量轮会重跑全量，确认轮那一份残留同样要清（否则会被当成本次确认轮数据读进 final）
      rmSync(resolve(OUT_DIR, "raw-retest2"), { recursive: true, force: true });
    }
  }

  // 复测清单始终生效，包括显式 --scenario 过滤的运行。
  // 早先这里写的是「显式过滤时不复测」，理由是被过滤的子集不是"疑似回归清单"——
  // 但 check 阶段本来就只评估了被过滤的子集，跳过复测只会让过滤运行永远拿不到
  // raw2 → 落成 WARN「未复测」→ exit 0，即"跑单个场景时永远看不到 FAIL"。
  // 复测阶段的 PERF_SCENARIO 由下面的调用覆盖为清单内容，用户过滤不会串到复测里。
  const parseForced = (name) =>
    (process.env[name] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  const forced = parseForced("PERF_FORCE_SUSPECTS");
  if (forced.length > 0) {
    console.log(`[perf] 测试钩子 PERF_FORCE_SUSPECTS 生效：${forced.join(", ")}`);
  }
  const forced2 = parseForced("PERF_FORCE_SUSPECTS2");
  if (forced2.length > 0) {
    console.log(`[perf] 测试钩子 PERF_FORCE_SUSPECTS2 生效：${forced2.join(", ")}`);
  }

  const pwArgs = [PW_CLI, "test", "-c", CONFIG];

  if (!retestOnly && !retest2Only) {
    rmSync(resolve(OUT_DIR, "raw"), { recursive: true, force: true });
    // 陈旧报告也要清：本地连跑两次时，上一次的 report.md 会被误当成本次结论
    // （移交模式下本 job 不产出 report.md，残留会把"已移交待复测"读成"已有判定"）
    rmSync(resolve(OUT_DIR, "report.md"), { force: true });

    const code1 = await runCommand(pwArgs, baseEnv);
    if (code1 !== 0) {
      // 方向 2（issue #247）：单场景超时/失败不再整轮作废。
      // playwright 退出非 0 只说明"有场景没跑完"，不代表"整轮没测到"——只要还有采样落盘，
      // 就让 check / 复测 / final 照常跑下去，未测量场景由 final 统一列清单并 exit 2。
      // raw 目录为空才是真的没测到（server 起不来、启动即崩），维持旧行为直接 exit 2。
      const sampleCount = countRawSamples(resolve(OUT_DIR, "raw"));
      if (sampleCount === 0) {
        console.error(
          `[perf] 测量阶段失败（playwright exit=${code1}）且未落盘任何采样，按 infra 故障处理。`,
        );
        process.exit(2);
      }
      console.warn(
        `[perf] 测量阶段 playwright exit=${code1}，但已落盘 ${sampleCount} 份采样——继续判定；` +
          `未测量的场景由 final 报告统一列出并以 exit 2 报出。`,
      );
    }

    const checkCode = await runCommand(["tests/perf/report.mjs", "--phase=check"]);
    if (checkCode !== 0) {
      console.error(`[perf] check 阶段异常（exit=${checkCode}）`);
      process.exit(2);
    }
  }

  // ---- 确认轮 job（PERF_RETEST2_ONLY=1，#294）----
  // R1 / R2 / 候选清单 / 基线全部来自上游产物，本 job 只负责「在第三个 runner 上
  // 复测候选场景 + 出 final」。因此这里**不能**跑 check / 复测，也不能清上游目录。
  if (retest2Only) {
    const candidates = forced2.length > 0 ? forced2 : readIdList("retest2.json");
    if (forced2.length > 0) {
      writeFileSync(
        resolve(OUT_DIR, "retest2.json"),
        JSON.stringify(candidates, null, 2),
        "utf8",
      );
    }
    if (candidates.length === 0) {
      // 上游说"无需确认轮"却起了这个 job：属于编排不一致，但按上游结论走 final
      // （与 retestOnly 下"复测清单为空"同理，不擅自改判）。
      console.log("[perf] 确认轮候选清单为空：仅做 final 判定（无确认轮，相关行不会判 FAIL）");
    } else {
      console.log(`[perf] 确认轮复测 ${candidates.length} 个场景：${candidates.join(", ")}`);
      const confirmCode = await runCommand(pwArgs, {
        ...baseEnv,
        PERF_SCENARIO: candidates.join(","),
        PERF_RAW_DIR: ".perf-output/raw-retest2",
        // 同理隔离：绝不能覆盖首轮 pw-report.json（final 的「应测场景」分母靠它，#247）
        PERF_PW_REPORT: ".perf-output/pw-report-retest2.json",
      });
      if (confirmCode !== 0) {
        // 确认轮跑挂 = FAIL 无法确认。按 infra 故障处理：宁可 exit 2 也不产出不可信结论。
        // report.mjs 会把候选场景落成 UNCONFIRMED（「确认轮未测量」），语义与此处一致。
        const sampleCount = countRawSamples(resolve(OUT_DIR, "raw-retest2"));
        console.error(
          `[perf] 确认轮阶段失败（exit=${confirmCode}，落盘 ${sampleCount} 份采样）——` +
            `FAIL 无法确认；仍继续出 final，相关场景会落 UNCONFIRMED。`,
        );
        if (sampleCount === 0) {
          // 整轮一份采样都没有：与「未测量」同性质，直接按 infra 故障退出。
          // 继续跑 final 也会得到同样的结论（report 的 confirmRoundMissing 分支 exit 2），
          // 但那要等整个 final 跑完——这里早退，省掉无谓的三轮比对。
          process.exit(2);
        }
      }
    }
    const confirmFinalArgs = ["tests/perf/report.mjs", "--phase=final"];
    if (updateBaseline) confirmFinalArgs.push("--update-baseline=1");
    process.exit(await runCommand(confirmFinalArgs));
  }

  const suspects = forced.length > 0 ? forced : readIdList("retest.json");
  if (forced.length > 0) {
    // 钩子要把"生效清单"也写回 retest.json：工作流的「是否需要独立复测 job」判定读的是这个文件，
    // 否则强制演练只会改本进程内的行为、job2 不会被触发（CI 上就验证不到复测 job）。
    writeFileSync(resolve(OUT_DIR, "retest.json"), JSON.stringify(suspects, null, 2), "utf8");
  }
  const plan = planRetestPhases({
    splitRetest: process.env.PERF_SPLIT_RETEST === "1",
    retestOnly,
    suspects,
  });

  if (plan.handoff) {
    console.log(
      `[perf] 疑似 ${suspects.length} 个场景（${suspects.join(", ")}）——移交独立 job 在新 runner 上复测`,
    );
    console.log(
      "[perf] 同 runner 顺序复测无法过滤「慢会话」（issue #234），故本 job 不做 final 判定",
    );
    process.exit(0);
  }

  if (suspects.length > 0) {
    console.log(`[perf] 复测 ${suspects.length} 个场景：${suspects.join(", ")}`);
    const retestCode = await runCommand(pwArgs, {
      ...baseEnv,
      PERF_SCENARIO: suspects.join(","),
      PERF_RAW_DIR: ".perf-output/raw-retest",
      // 复测轮写到独立文件：否则会覆盖首轮 pw-report.json，
      // 使 final 的「应测场景」分母只剩复测的少数几个（覆盖核算全错，issue #247）。
      PERF_PW_REPORT: ".perf-output/pw-report-retest.json",
    });
    if (retestCode !== 0) {
      // 复测跑挂既不是"有回归"也不是"没回归"：按 infra 故障处理，不做无根据的判定
      console.error(`[perf] 复测阶段失败（exit=${retestCode}），无法完成"连续 2 次"判定`);
      process.exit(2);
    }

    // ---- confirm 相位（#294）----
    // 必须紧跟在复测之后：它的输入是 R1 + R2，没有 R2 时「双超」无从谈起，
    // 跑它只会得到一个必然为空的清单（多一个子进程，且日志上误导）。
    const confirmCode = await runCommand(["tests/perf/report.mjs", "--phase=confirm"]);
    if (confirmCode !== 0) {
      console.error(`[perf] confirm 阶段异常（exit=${confirmCode}）`);
      process.exit(2);
    }
  } else {
    // 无复测轮 → 不可能有 R1∧R2 双超，也就没有确认轮候选。跳过 confirm 直接 final。
    console.log(
      retestOnly
        ? "[perf] 复测清单为空：仅做 final 判定（无复测轮，相关行会落成 WARN「未复测」）"
        : "[perf] 无复测轮：直接出 final 判定",
    );
  }

  // 确认轮候选：来自本进程的 confirm 相位（无复测轮时为空），或上游产物 retest2.json
  const candidates = forced2.length > 0 ? forced2 : readIdList("retest2.json");
  if (forced2.length > 0) {
    // 同 PERF_FORCE_SUSPECTS：钩子必须把生效清单写回文件，否则工作流的 suspects2 输出为空，
    // 第三个 job 不会被触发（CI 上就验证不到 retest2 job 与 -retest2 产物）。
    writeFileSync(
      resolve(OUT_DIR, "retest2.json"),
      JSON.stringify(candidates, null, 2),
      "utf8",
    );
  }
  const confirmPlan = planConfirmPhases({
    // 拆分编排（CI 的 retest job）才移交；本地单进程没有下一个 job，硬移交等于不判了
    splitRetest: process.env.PERF_SPLIT_RETEST === "1",
    candidates,
  });

  if (confirmPlan.handoff) {
    console.log(
      `[perf] 确认轮候选 ${candidates.length} 个场景（${candidates.join(", ")}）——` +
        `移交独立 job 在第三个 runner 上确认`,
    );
    console.log(
      "[perf] 两个会话可能被并发同时拖慢（#294），双超不足以确认 FAIL，故本 job 不做 final 判定",
    );
    process.exit(0);
  }

  if (candidates.length > 0) {
    if (retestOnly) {
      console.log(
        `[perf] 确认轮复测 ${candidates.length} 个场景：${candidates.join(", ")}` +
          `（⚠️ 本地为单进程，与 R1/R2 同 runner——独立性不足，FAIL 结论请以 CI 拆 job 的运行为准）`,
      );
    } else {
      console.log(`[perf] 确认轮复测 ${candidates.length} 个场景：${candidates.join(", ")}`);
    }
    const confirmRunCode = await runCommand(pwArgs, {
      ...baseEnv,
      PERF_SCENARIO: candidates.join(","),
      PERF_RAW_DIR: ".perf-output/raw-retest2",
      PERF_PW_REPORT: ".perf-output/pw-report-retest2.json",
    });
    if (confirmRunCode !== 0) {
      const sampleCount = countRawSamples(resolve(OUT_DIR, "raw-retest2"));
      console.error(
        `[perf] 确认轮阶段失败（exit=${confirmRunCode}，落盘 ${sampleCount} 份采样）——` +
          `仍继续出 final，相关场景会落 UNCONFIRMED（不判 FAIL）`,
      );
      if (sampleCount === 0) {
        // 候选非空却一份采样都没有 = 确认环节根本没跑成。final 的 confirmRoundMissing
        // 分支也会 exit 2，但这里早退更省。
        process.exit(2);
      }
    }
  } else {
    console.log("[perf] 无确认轮候选：直接出 final 判定");
  }

  const finalArgs = ["tests/perf/report.mjs", "--phase=final"];
  if (updateBaseline) finalArgs.push("--update-baseline=1");
  const finalCode = await runCommand(finalArgs);
  process.exit(finalCode);
}

main();
