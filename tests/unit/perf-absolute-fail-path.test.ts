// 绝对判定的失败路径端到端测试（P1 回归锁）
//
// 背景：绝对判定的指标名是 `frameMs.p95(绝对)` / `jankRatePct(绝对)` 这种带后缀的形式，
// 不命中 PRIMARY_METRICS，因此会被"派生指标需主指标佐证"规则要求佐证。
// 一旦 check 阶段把它滤出复测清单，final 阶段就拿不到 raw2 → 落成 WARN「未复测」→ exit 0，
// 「绝对目标未达标（非回归）」这段分支永远不可达——用户跑
// `PERF_HEADED=1 PERF_FRAME_BUDGET_MS=8.3 PERF_DOC_FILE=<压测文件> pnpm run benchmark`
// 时，掉帧率超标却拿到绿灯。
//
// 之前没暴露的原因：人工构造验证时直接摆好了 raw-retest 文件，绕过了 check→复测这一环。
// 所以这里用子进程真实调用 report.mjs 跑完整两阶段，断言"check 阶段必须列出该场景"。

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPerfReportWorkspace, type PerfReportWorkspace } from "./perf-report-env";

const REPORT = "tests/perf/report.mjs";
const ID = "scroll-E-absolute";
const BUDGET_MS = 16.7;

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

const roots: string[] = [];
let perf: PerfReportWorkspace;

beforeEach(() => {
  // 四个目录全隔离（含 BASELINE）——隔离标准见 perf-report-env.ts
  perf = createPerfReportWorkspace("perf-abs-");
  roots.push(perf.root);
});

afterEach(() => {
  // 隔离是否完整：真实 .perf-baseline 必须一字未动（漏重定向哪个目录都会在这里炸）
  perf.assertRepoBaselineUntouched();
});

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

/** 构造一份 scroll 采样：只让 jankRatePct 超阈值（帧间隔全部落在预算内，绝对 p95 行 PASS） */
function rawFor(jankRatePct: number, absoluteEligible: boolean): Record<string, unknown> {
  const frameMs = Array.from({ length: 120 }, (_, i) => 16 + (i % 3) * 0.5);
  return {
    id: ID,
    scenario: "scroll",
    tier: "S",
    kind: "rich",
    env: "local",
    profile: "quick",
    rounds: 2,
    warmups: 1,
    mode: "headless",
    absoluteEligible,
    fixture: { version: 2, hash: "absfailpath01", lines: 1000, source: "generated:rich" },
    samples: { frameMs },
    scalars: {
      frameBudgetMs: BUDGET_MS,
      jankFactor: 1.5,
      step: 240,
      jankCount: Math.round((jankRatePct / 100) * 120),
      jankRatePct,
      longFrameCount: 0,
      longTaskCount: 0,
      longTaskMs: 0,
      cls: 0,
      heapDeltaMB: 0,
    },
  };
}

function writeRaw(dir: "raw" | "raw-retest", jankRatePct: number, eligible = true): void {
  writeFileSync(
    join(dir === "raw" ? perf.rawDir : perf.retestDir, `${ID}.json`),
    JSON.stringify(rawFor(jankRatePct, eligible), null, 2),
    "utf8",
  );
}

/** 真实调用 report.mjs（两阶段之一），返回退出码与输出 */
function runReport(phase: "check" | "final"): RunResult {
  // 判定资格完全由 raw 里的 absoluteEligible 决定；继承来的 PERF_*（含 PERF_ABSOLUTE）
  // 已由 perf.env() 统一剥离，避免开发者 shell 的 export 改变被测行为
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

function retestList(): string[] {
  const file = join(perf.outDir, "retest.json");
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as string[]) : [];
}

function reportTable(): string {
  const file = join(perf.outDir, "report.md");
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

describe("绝对判定的失败路径", () => {
  it("绝对行超阈值必须进入复测清单（曾被佐证规则滤掉，导致 FAIL 路径不可达）", () => {
    writeRaw("raw", 15); // 15% > 10% 阈值
    const check = runReport("check");

    expect(check.status).toBe(0);
    expect(retestList()).toContain(ID);
  });

  it("复测仍超阈值 → 绝对行 FAIL + 输出「绝对目标未达标」+ exit 1", () => {
    writeRaw("raw", 15);
    expect(runReport("check").status).toBe(0);
    writeRaw("raw-retest", 15); // 复测复现

    const final = runReport("final");

    expect(final.status).toBe(1);
    expect(final.stderr).toContain("绝对目标未达标");
    expect(final.stderr).not.toContain("相对回归确认");
    const table = reportTable();
    expect(table).toContain("jankRatePct(绝对)");
    expect(table).toMatch(/jankRatePct\(绝对\)[^\n]*FAIL（复测仍超帧预算）/);
  });

  it("复测回落 → 判为抖动（WARN）+ exit 0，不把单次波动当目标未达标", () => {
    writeRaw("raw", 15);
    expect(runReport("check").status).toBe(0);
    writeRaw("raw-retest", 4); // 复测回落到阈值内

    const final = runReport("final");

    expect(final.status).toBe(0);
    expect(final.stderr).not.toContain("绝对目标未达标");
    expect(reportTable()).toMatch(/jankRatePct\(绝对\)[^\n]*WARN（复测回落（抖动））/);
  });

  it("对照组：absoluteEligible=false 时不产出绝对行，check 无复测项、exit 0", () => {
    writeRaw("raw", 15, false);
    const check = runReport("check");

    expect(check.status).toBe(0);
    expect(retestList()).toEqual([]);

    const final = runReport("final");
    expect(final.status).toBe(0);
    expect(reportTable()).not.toContain("(绝对)");
    expect(reportTable()).toContain("未参与绝对判定");
  });
});
