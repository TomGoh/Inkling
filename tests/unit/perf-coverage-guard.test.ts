// 判定覆盖守卫的端到端测试
//
// 背景：基线缺失时所有场景都是 NEW，报告仍会打印「FAIL：0」——那看起来像"没有回归"，
// 实际是"什么都没比"。发版验证（tag 运行）尤其不能被这种假绿灯掩盖，
// 因此引入 PERF_REQUIRE_COMPARISON=1：覆盖不足时退出码 2（infra 故障），并显式说明
// 「本次结论不构成性能验证」。
//
// 这里用子进程真实调用 report.mjs，覆盖四种组合（有/无基线 × 有/无守卫）。

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPerfReportWorkspace, type PerfReportWorkspace } from "./perf-report-env";

const REPORT = "tests/perf/report.mjs";
const ID = "scroll-C-coverage";

const roots: string[] = [];
let perf: PerfReportWorkspace;

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function writeRaw(id = ID, frameMs = Array.from({ length: 120 }, (_, i) => 16.7 + (i % 3) * 0.1)): void {
  const raw = {
    id,
    scenario: "scroll",
    tier: "S",
    kind: "rich",
    env: "local",
    profile: "quick",
    rounds: 2,
    warmups: 1,
    mode: "headless",
    absoluteEligible: false,
    fixture: { version: 2, hash: "coverage0001", lines: 1000, source: "generated:rich" },
    samples: { frameMs },
    scalars: {
      frameBudgetMs: 16.7,
      jankFactor: 1.5,
      step: 240,
      jankCount: 0,
      jankRatePct: 0,
      longFrameCount: 0,
      longTaskCount: 0,
      longTaskMs: 0,
      cls: 0,
      heapDeltaMB: 0,
    },
  };
  writeFileSync(join(perf.rawDir, `${id}.json`), JSON.stringify(raw, null, 2), "utf8");
}

/** 写一份与当前采样元数据匹配的基线（可指定 metrics，默认空对象模拟"无可用指标"） */
function writeBaseline(metrics: Record<string, unknown> = {}): void {
  mkdirSync(join(perf.baselineDir, "local", "quick", "headless", "r2"), { recursive: true });
  writeFileSync(
    join(perf.baselineDir, "local", "quick", "headless", "r2", `${ID}.json`),
    JSON.stringify(
      {
        schemaVersion: 2,
        env: "local",
        profile: "quick",
        mode: "headless",
        rounds: 2,
        scenario: "scroll",
        tier: "S",
        kind: "rich",
        fixture: { version: 2, hash: "coverage0001", lines: 1000, source: "generated:rich" },
        metrics,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
}

/** 跑 report.mjs；requireComparison 模拟 tag 运行的 PERF_REQUIRE_COMPARISON=1 */
function runReport(
  phase: "check" | "final",
  { requireComparison = false, updateBaseline = false, absolute = false } = {},
): RunResult {
  const args = [REPORT, `--phase=${phase}`];
  if (updateBaseline) args.push("--update-baseline=1");
  // 继承来的 PERF_*（含 PERF_ABSOLUTE / PERF_REQUIRE_COMPARISON）已由 perf.env() 统一剥离，
  // 这里只需显式给出本用例想要的开关——"守卫关闭"分支因此是真的关闭
  const env = perf.env({
    ...(requireComparison ? { PERF_REQUIRE_COMPARISON: "1" } : {}),
    ...(absolute ? { PERF_ABSOLUTE: "1" } : {}),
  });

  try {
    const stdout = execFileSync(process.execPath, args, { env, encoding: "utf8" });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? -1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

function report(): string {
  return readFileSync(join(perf.outDir, "report.md"), "utf8");
}

beforeEach(() => {
  perf = createPerfReportWorkspace("perf-cov-");
  roots.push(perf.root);
  writeRaw();
});

afterEach(() => {
  perf.assertRepoBaselineUntouched();
});

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

describe("判定覆盖守卫（PERF_REQUIRE_COMPARISON）", () => {
  it("无基线 + 守卫开启 → exit 2，且明确说明「不构成性能验证」", () => {
    const result = runReport("final", { requireComparison: true });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("判定覆盖不足");
    expect(result.stderr).toContain("不构成性能验证");
    // 报告本身也要说清覆盖面，而不是只留一个 FAIL：0
    expect(report()).toContain("判定覆盖：0/1 个场景参与相对判定");
    expect(result.stdout).toContain("[perf] 判定覆盖：0/1");
  });

  it("无基线 + 守卫关闭（PR 运行/首次建立基线）→ exit 0，行为不变", () => {
    const result = runReport("final");

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain("判定覆盖不足");
    expect(report()).toContain("判定覆盖：0/1 个场景参与相对判定");
  });

  it("check 阶段不受守卫影响：否则首个 --update-baseline 运行会被中途判为 infra 故障", () => {
    const check = runReport("check", { requireComparison: true, updateBaseline: true });

    expect(check.status).toBe(0);
    // 基线确实被写入（说明 check 未被守卫打断，后续阶段可继续）
    expect(runReport("final", { requireComparison: true }).status).toBe(0);
  });

  it("有可比基线 + 守卫开启 → exit 0，覆盖 1/1", () => {
    expect(runReport("final", { updateBaseline: true }).status).toBe(0);
    writeRaw(); // 同配置再跑一次，这次应命中基线

    const result = runReport("final", { requireComparison: true });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("[perf] 判定覆盖：1/1 个场景参与相对判定");
    expect(report()).toContain("判定覆盖：1/1 个场景参与相对判定");
  });

  it("分辨率披露：3σ 占参考值 ≥30% 时报告显式提醒——PASS 不等于「没问题」", () => {
    // 手工构造一份"高噪声"基线：同一配置的历史值散布极大（16.8 / 16.9 / 40）
    // → 3σ 远超参考值 30%，此时该指标的相对判定只剩"抓大事故"的能力
    writeBaseline({
      frameMs: {
        median: 17,
        p95: 17.5,
        max: 18,
        n: 120,
        history: [16.8, 16.9, 40],
        historyP95: [17, 17.5, 41],
      },
    });

    const result = runReport("final");
    const table = report();

    expect(result.status).toBe(0);
    expect(table).toContain("3σ（占参考）");
    expect(table).toMatch(/\| \d+(\.\d+)?（\d+%） \|/); // 3σ 列带占比
    expect(table).toContain("分辨率提醒");
    expect(table).toMatch(/分辨率提醒：\d+ 行的 3σ ≥ 参考值的 30%/);
    expect(table).toContain(`${ID}:frameMs`);
  });

  it("元数据可比但基线里没有可用指标 → 记为 EMPTY_BASELINE，不得算作已比较", () => {
    // 复现场景：基线文件 metrics 为空（部分生成），或指标 schema 变更导致逐个指标被跳过。
    // 此时 baselineComparability 返回 OK、compareRun 静默跳过所有指标——表格是空的，
    // 若只按 baselineState 计数就会得到"覆盖 1/1"，重新制造假绿灯。
    writeBaseline({});

    const result = runReport("final", { requireComparison: true });

    expect(result.status).toBe(2); // 覆盖不足 → 不构成性能验证
    expect(result.stdout).toContain("[perf] 判定覆盖：0/1 个场景参与相对判定");
    expect(result.stderr).toContain("判定覆盖不足");
    expect(report()).toContain("未参与相对判定：EMPTY_BASELINE");
  });

  it("绝对行不算相对覆盖：PERF_ABSOLUTE=1 + 空指标基线 → 仍判 EMPTY_BASELINE → exit 2", () => {
    // 边界：`metrics` 里混含不依赖基线的绝对行（帧预算 p95 / 掉帧率）。
    // 若用 `metrics.length > 0` 判"已比较"，绝对行会让覆盖虚报为 OK，
    // EMPTY_BASELINE 不触发——同一族假绿灯的最后一角。
    writeBaseline({}); // 元数据可比、无可用指标
    writeRaw();

    const result = runReport("final", { requireComparison: true, absolute: true });

    expect(report()).toContain("(绝对)"); // 确认本次真的产出了绝对行
    expect(result.status).toBe(2);
    expect(result.stdout).toContain("[perf] 判定覆盖：0/1 个场景参与相对判定");
    expect(report()).toContain("未参与相对判定：EMPTY_BASELINE");
  });

  it("覆盖不足优先于 exit 1：同时存在回归复现时，仍以 exit 2 报出「结论不完整」并列出 FAIL", () => {
    // A 场景：可比基线 + 复测复现的回归（raw 与 raw-retest 均为同一份超阈值采样）
    const A = "scroll-C-coverA";
    const B = "scroll-C-coverB";
    writeRaw(A);
    expect(runReport("final", { updateBaseline: true }).status).toBe(0); // 先建立 A 的基线
    const regressed = Array.from({ length: 120 }, (_, i) => 30 + (i % 3) * 0.1); // 相对 +79%
    writeRaw(A, regressed);
    writeFileSync(join(perf.retestDir, `${A}.json`), readFileSync(join(perf.rawDir, `${A}.json`), "utf8"));
    // B 场景：完全没有基线 → 覆盖 1/2
    writeRaw(B);

    const result = runReport("final", { requireComparison: true });

    expect(result.status).toBe(2); // 覆盖不足优先（否则 CI 只看到"回归"，看不出验证不完整）
    expect(result.stderr).toContain("判定覆盖不足");
    expect(result.stderr).toContain("注意：本次同时存在 FAIL");
    expect(result.stderr).toContain(A);
  });
});
