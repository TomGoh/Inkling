// 派生指标「主指标佐证」的证据基础（#270）
//
// 背景：`report.mjs` 的佐证判定原先只看**首轮**（`primaryOver`，且是场景级豁免），而终判用的是
// 「首轮 + 复测」两轮证据。两者不一致时，「首轮超阈值、复测回落」的主指标行（已被判 WARN、
// 已宣告是抖动）仍能给全场景的派生指标发豁免券 —— 结果出现「同一场景零主指标 FAIL 却产出 FAIL、
// retest job 红、exit 1」。真实案例见 issue #270（`scroll-M-rich`，2026-09-28）。
//
// 本文件用**真实调用 report.mjs 的子进程**跑完整三阶段，锁住四条边界：
//   1. 主指标只超首轮 → 派生指标不得判 FAIL（本 issue 现象，exit 0）
//   2. 主指标三轮都超 → 派生指标照常判 FAIL（护栏：真回归不许被降级，exit 1）
//   3. 场景内没有主指标参与 → 派生指标只提示 WARN（行为与修复前一致）
//   4. 绝对行不受佐证约束（它本来就是定向测量，只在 headed/uncapped 下产出）
//
// ⚠️ #294 起判定是**三轮**（首轮 / 复测 / 确认轮），凡涉及「复现」的用例都要补第三轮
// 与 retest2.json 候选清单，否则双超只会落 WARN「未确认」而不会判 FAIL。
//
// 数值全部取 issue #270 的真实采样（`scroll-M-rich` 的 raw / raw-retest 与基线 history），
// 这样用例同时是「线上那一轮」的回归锁。

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPerfReportWorkspace, type PerfReportWorkspace } from "./perf-report-env";

const REPORT = "tests/perf/report.mjs";
const ID = "scroll-M-rich";
const BUDGET_MS = 16.7;

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

const roots: string[] = [];
let perf: PerfReportWorkspace;

beforeEach(() => {
  perf = createPerfReportWorkspace("perf-corroborate-");
  roots.push(perf.root);
});

afterEach(() => {
  perf.assertRepoBaselineUntouched();
});

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

/**
 * 造帧序列：中位数 = med、p95 = p95。
 * `statsFor` 的 p95 取 `sorted[floor(n*0.95)]`（n=240 → 下标 228），故前 227 帧为 med、其余 13 帧为 p95。
 */
function frameSamples(med: number, p95: number): number[] {
  return [...Array<number>(227).fill(med), ...Array<number>(13).fill(p95)];
}

/** 真实基线（issue #270）：主指标 frameMs / 派生指标 longFrameCount 的 8 点历史 */
function writeBaseline(): void {
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
        tier: "M",
        kind: "rich",
        fixture: { version: 2, hash: "corroborate1", lines: 5000, source: "generated:rich" },
        metrics: {
          frameMs: {
            median: 16.7,
            p95: 23.8,
            max: 88.1,
            n: 240,
            history: [16.7, 16.5, 16.8, 16.55, 16.65, 16.6, 16.7, 16.7],
            historyP95: [21.4, 24.1, 24.4, 24.1, 22.1, 24.2, 22.3, 23.5],
          },
          longFrameCount: {
            median: 0.75,
            p95: null,
            max: null,
            n: null,
            scalar: true,
            history: [0, 1, 0, 1, 0.5, 0.5, 3, 2],
          },
        },
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
}

interface RawOptions {
  frameP95: number;
  longFrameCount: number;
  /** 掉帧率（%），默认 3.75；绝对行的门槛是 10%（report.mjs 的 JANK_RATE_LIMIT_PCT） */
  jankRatePct?: number;
  absoluteEligible?: boolean;
}

function rawFor({
  frameP95,
  longFrameCount,
  jankRatePct = 3.75,
  absoluteEligible = false,
}: RawOptions): unknown {
  return {
    id: ID,
    scenario: "scroll",
    tier: "M",
    kind: "rich",
    env: "local",
    profile: "quick",
    rounds: 2,
    warmups: 1,
    mode: "headless",
    absoluteEligible,
    fixture: { version: 2, hash: "corroborate1", lines: 5000, source: "generated:rich" },
    samples: { frameMs: frameSamples(16.7, frameP95) },
    scalars: {
      frameBudgetMs: BUDGET_MS,
      jankFactor: 1.5,
      step: 240,
      jankCount: 4.5,
      jankRatePct,
      longFrameCount,
      longTaskCount: 0,
      longTaskMs: 0,
      cls: 0,
      heapDeltaMB: 0,
    },
  };
}

function writeRaw(dir: "raw" | "raw-retest" | "raw-retest2", options: RawOptions): void {
  const target =
    dir === "raw" ? perf.rawDir : dir === "raw-retest" ? perf.retestDir : perf.retest2Dir;
  writeFileSync(join(target, `${ID}.json`), JSON.stringify(rawFor(options), null, 2), "utf8");
}

function runReport(phase: "check" | "final"): RunResult {
  const env = perf.env();
  try {
    const stdout = execFileSync(process.execPath, [REPORT, `--phase=${phase}`], {
      env,
      encoding: "utf8",
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? -1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

function reportTable(): string {
  const file = join(perf.outDir, "report.md");
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

/** 取报告表格里某指标那一行 */
function row(metric: string): string {
  return reportTable()
    .split("\n")
    .find((l) => l.startsWith(`| ${ID} | ${metric} |`)) ?? "";
}

describe("派生指标的佐证基准（#270）", () => {
  beforeEach(() => {
    writeBaseline();
  });

  it("主指标只超首轮（复测回落）→ 派生指标不判 FAIL，exit 0", () => {
    // frameMs.p95：首轮 31.2（+31.1%）、复测 29.7（+24.8%，未过 25% 阈值）
    // longFrameCount：首轮 8 / 复测 8.5，两轮都超（不受地板抑制）
    // 无确认轮数据：R2 已回落即止步，确认轮只跑双超的候选
    writeRaw("raw", { frameP95: 31.2, longFrameCount: 8 });
    writeRaw("raw-retest", { frameP95: 29.7, longFrameCount: 8.5 });

    const result = runReport("final");

    // 主指标行确实是「首轮超、复测回落」
    expect(row("frameMs.p95")).toContain("WARN（复测回落（抖动））");
    // 派生指标两轮都超，但没有「同样被判 FAIL」的主指标 → 只提示 WARN
    expect(row("longFrameCount")).toContain("WARN（派生指标无主指标佐证（疑似运行抖动））");
    // 复测值必须仍然披露（结论是"无佐证"，不代表没数据）
    expect(row("longFrameCount")).toContain("| 8.5 |");
    // 全表不得出现 FAIL 行、退出码为 0 —— 修复前这里是 FAIL + exit 1
    expect(reportTable()).not.toContain("| FAIL");
    expect(result.status).toBe(0);
  });

  it("主指标三轮都超 → 派生指标照常判 FAIL，exit 1（护栏：真回归不许被降级）", () => {
    writeRaw("raw", { frameP95: 31.2, longFrameCount: 8 });
    writeRaw("raw-retest", { frameP95: 30.5, longFrameCount: 8.5 });
    // #294：FAIL 须由第三个独立 runner 确认，故"复现"用例必须补第三轮并登记候选。
    // 佐证基准同步扩到三轮：主指标三轮都超才给派生指标发豁免券。
    writeRaw("raw-retest2", { frameP95: 30.8, longFrameCount: 8.6 });
    perf.writeConfirmCandidates([ID]);

    const result = runReport("final");

    expect(row("frameMs.p95")).toContain("FAIL（复测仍超阈值 + 末轮仍超）");
    expect(row("longFrameCount")).toContain("FAIL（复测仍超阈值 + 末轮仍超）");
    expect(result.status).toBe(1);
  });

  it("佐证扩到三轮：主指标仅两轮超、确认轮回落 → 派生指标三轮都超也不得判 FAIL（#270 × #294）", () => {
    // 这是本文件在 #294 之后最关键的一条：佐证基准若仍停在两轮，
    // 一个"末轮已回落"的主指标仍会给派生指标发豁免券，在三段路径上重演 #270。
    writeRaw("raw", { frameP95: 31.2, longFrameCount: 8 }); // 主指标超
    writeRaw("raw-retest", { frameP95: 30.5, longFrameCount: 8.5 }); // 主指标超
    writeRaw("raw-retest2", { frameP95: 23.0, longFrameCount: 8.6 }); // 主指标回落
    perf.writeConfirmCandidates([ID]);

    const result = runReport("final");

    expect(row("frameMs.p95")).toContain("WARN（末轮回落（抖动））");
    expect(row("longFrameCount")).toContain("WARN（派生指标无主指标佐证（疑似运行抖动））");
    expect(result.status).toBe(0);
  });

  it("场景内没有主指标参与 → 派生指标只提示 WARN（与修复前一致）", () => {
    // frameMs.p95 = 23.0（+3.4%，未过阈值）；两个指标都给了复测轮
    writeRaw("raw", { frameP95: 23.0, longFrameCount: 8 });
    writeRaw("raw-retest", { frameP95: 23.0, longFrameCount: 8.5 });

    const result = runReport("final");

    expect(row("frameMs.p95")).toContain("PASS");
    expect(row("longFrameCount")).toContain("WARN（派生指标无主指标佐证（疑似运行抖动））");
    expect(result.status).toBe(0);
  });

  it("绝对行不受佐证约束：只有绝对行 FAIL 时照常 exit 1", () => {
    // 相对行全部不超（frameMs.p95 = 23.0），只有绝对行超：
    // 帧预算 16.7ms → 绝对 p95 门槛 2×16.7 = 33.4ms；掉帧率门槛 10%
    // #294：绝对行同样需要第三个 runner 确认——它此前也是「双超即判 FAIL」，
    // 不补确认轮就会成为假 FAIL 的漏网口。
    const absolute = { frameP95: 23.0, jankRatePct: 20, absoluteEligible: true };
    writeRaw("raw", { ...absolute, longFrameCount: 8 });
    writeRaw("raw-retest", { ...absolute, longFrameCount: 8.5 });
    writeRaw("raw-retest2", { ...absolute, longFrameCount: 8.5 });
    perf.writeConfirmCandidates([ID]);

    const result = runReport("final");

    // 相对派生行仍因「无主指标佐证」只提示 WARN（说明佐证守卫只作用于相对行）
    expect(row("longFrameCount")).toContain("WARN（派生指标无主指标佐证（疑似运行抖动））");
    // 绝对行自己照常判 FAIL（它是派生指标名，但不吃佐证规则）
    expect(reportTable()).toMatch(/jankRatePct\(绝对\).*FAIL（复测仍超帧预算 \+ 末轮仍超）/);
    expect(result.status).toBe(1);
  });
});
