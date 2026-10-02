// 确认轮（第三轮）判定的端到端测试（issue #294）
//
// ## 要修的缺陷
//
// #234 把复测拆到独立 runner，挡住了「单会话慢」——但**两个会话可以同时被拖慢**。
// 共享 runner 池内跨工作流的并发（自家 Build 的 test job、main 打包、其他 Benchmark）
// 会让同一测量窗口里的两台 VM 一起变慢，于是「连续 2 次复现」成立、结论却是错的。
//
// 2026-09-30 实证 3 例，全部在换 runner 静默复跑后被证伪：
//
// | 运行 | 场景:指标 | 首轮 / 复测 | 原判定 | 静默复跑（核验） |
// |---|---|---|---|---|
// | main `36744491496` | search-M-rich:searchMs.p95 | 549.5 / 584.1 | FAIL | `36747934459`：427.5 → PASS |
// | #289 `36745136381` | scroll-M-rich:frameMs.p95 | 33.5 / 33.8 | FAIL | `36748649597`：19 → PASS |
// | #293 `36750412468` | search-M-rich:searchMs(.p95) | 525/634 → 638/822.5 | FAIL | `36752499229`：FAIL 0 |
//
// 本文件用**合成 fixture**（issue 的实测数值）把三条形态锁死：
//   1. 假 FAIL 形态（R1∧R2 双超、R3 回落）→ 逐行 WARN「末轮回落」，**无 FAIL**，exit 0
//   2. 真回归（三轮都超）→ FAIL + exit 1（护栏：本 issue 不能把真回归也降级掉）
//   3. 确认轮不可信 / 缺失 → UNCONFIRMED + tag 运行 exit 2（**绝不**判 FAIL）
//
// 另锁标定越界的处置（R2 越界 → 强制进确认轮；R3 越界 → 不确认 FAIL）与
// #270 佐证基准扩到三轮。合成 fixture 而非真实产物：确定性、可复算、不把环境噪声带进仓库。

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPerfReportWorkspace, type PerfReportWorkspace } from "./perf-report-env";

const REPORT = "tests/perf/report.mjs";
const ID = "search-M-rich";
const BUDGET_MS = 16.7;

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

const roots: string[] = [];
let perf: PerfReportWorkspace;

beforeEach(() => {
  perf = createPerfReportWorkspace("perf-retest2-");
  roots.push(perf.root);
});

afterEach(() => {
  perf.assertRepoBaselineUntouched();
});

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

/**
 * 基线取自 issue #294 的实测：searchMs 基线中位 477ms、p95 参考 500ms，
 * probeMs 基线参考 41.22ms、历史范围 30.95–50.85（题面给出的真数据）。
 *
 * history 给 8 点（≥ NOISE_MIN_POINTS=3），3σ 因此启用——真实 CI 基线就是 8 点，
 * 用少于 3 点会让判定退化成「百分比 + 绝对地板」，与线上口径不一致。
 */
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
        scenario: "search",
        tier: "M",
        kind: "rich",
        // fixture hash 是 #294 实录的搜索场景固件（与 3 例假 FAIL 同源）
        fixture: { version: 2, hash: "retest2demo01", lines: 5000, source: "generated:rich" },
        metrics: {
          searchMs: {
            median: 477,
            p95: 500,
            max: 900,
            n: 30,
            // 历史围绕 477 上下分布 → 3σ ≈ 3×sampleSd，远小于 15% 阈值（477×15% ≈ 72）
            history: [470, 480, 475, 490, 465, 485, 472, 478],
            historyP95: [495, 505, 500, 510, 490, 508, 498, 502],
          },
          // 会话标定（#236）：进基线、不参与判定。历史范围 31–44ms 的压缩版
          // （issue 实录是 30.95–50.85，两档机器档位），门槛 `v > hi × 1.1` = 48.4ms
          // —— issue 里 52.88ms 那轮正是越界样本。
          probeMs: { median: 41.22, p95: null, max: null, n: null, scalar: true, history: [31, 41, 36, 44, 39, 43, 34, 42] },
        },
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
}

interface RoundOptions {
  /** 该轮 searchMs 的中位数 */
  searchMedian: number;
  /** 该轮 searchMs 的 p95（不传则与中位数相同） */
  searchP95?: number;
  /** 会话标定值（#236）：不传则不落该字段（模拟老产物没有 probe） */
  probeMs?: number;
}

function rawFor({ searchMedian, searchP95, probeMs }: RoundOptions): unknown {
  // 30 个样本：前 28 个为中位值、后 2 个为 p95 值
  // （statsFor 的 p95 取 sorted[floor(30*0.95)] = sorted[28]）
  const samples = [
    ...Array<number>(28).fill(searchMedian),
    ...Array<number>(2).fill(searchP95 ?? searchMedian),
  ];
  return {
    id: ID,
    scenario: "search",
    tier: "M",
    kind: "rich",
    env: "local",
    profile: "quick",
    rounds: 2,
    warmups: 1,
    mode: "headless",
    absoluteEligible: false,
    fixture: { version: 2, hash: "retest2demo01", lines: 5000, source: "generated:rich" },
    samples: { searchMs: samples },
    scalars: {
      frameBudgetMs: BUDGET_MS,
      ...(probeMs === undefined ? {} : { probeMs }),
    },
  };
}

type RoundDir = "raw" | "raw-retest" | "raw-retest2";

function dirPath(dir: RoundDir): string {
  return dir === "raw" ? perf.rawDir : dir === "raw-retest" ? perf.retestDir : perf.retest2Dir;
}

function writeRound(dir: RoundDir, options: RoundOptions): void {
  writeFileSync(join(dirPath(dir), `${ID}.json`), JSON.stringify(rawFor(options), null, 2), "utf8");
}

/** 真实调用 report.mjs（三个相位之一） */
function runReport(
  phase: "check" | "confirm" | "final",
  { requireComparison = false }: { requireComparison?: boolean } = {},
): RunResult {
  const env = perf.env({ ...(requireComparison ? { PERF_REQUIRE_COMPARISON: "1" } : {}) });
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

function report(): string {
  const file = join(perf.outDir, "report.md");
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

function latest(): {
  rounds: { measured: boolean; retest: boolean; confirm: boolean };
  unconfirmed: string[];
  results: Array<{ id: string; metrics: Array<{ metric: string; verdict: string; retest2?: number }> }>;
} {
  return JSON.parse(readFileSync(join(perf.outDir, "latest.json"), "utf8"));
}

function idList(fileName: string): string[] {
  const file = join(perf.outDir, fileName);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as string[]) : [];
}

function row(metric: string): string {
  return report()
    .split("\n")
    .find((l) => l.startsWith(`| ${ID} | ${metric} |`)) ?? "";
}

// ── issue #294 的三组实测数值 ────────────────────────────────────────────
// 基线的 probeMs 历史 [31,41,36,44,39,43,34,42] → 上限 44ms、越界门槛 44×1.1 = 48.4ms。
// issue 实录的越界值是 52.88ms（超门槛），核验会话是 41ms / 39ms（范围内）。
const PROBE_OK = 41; // 范围内（issue 的核验会话量级）
const PROBE_SLOW = 52.88; // issue #294 实录的越界值（> 48.4）
const PROBE_EDGE = 44; // 范围内上沿：刻意贴着门槛内侧，验证「范围内 → 正常判 FAIL」

describe("确认轮判定（#294：假 FAIL 根治）", () => {
  beforeEach(() => {
    writeBaseline();
  });

  // ── 1. 假 FAIL 形态：这是本 issue 的核心用例 ────────────────────────────
  describe("R1∧R2 双超但 R3 回落（3 例假 FAIL 的形态）", () => {
    // 三组都取自 issue 的实录形态：首轮与复测都超阈值，核验轮回落。
    // 数值按本文件基线等比缩放（issue 用的是 quick 档真实基线，本文件用同量级合成基线），
    // 保持「R1∧R2 双超、R3 回落」这一**形态**不变——形态才是本 issue 的判定对象。
    const cases = [
      { name: "main 36744491496", r1: 549.5, r2: 584.1, r3: 427.5 },
      { name: "#289 36745136381", r1: 638, r2: 822.5, r3: 484 },
      // 第三例取 issue 的 searchMs 形态（首轮 525 / 复测 634 / 核验 479），
      // 按本基线（median 参考 476.5、15% 阈值）等比放大到 560 / 640，保证双超成立
      { name: "#293 36750412468", r1: 560, r2: 640, r3: 479 },
    ];

    for (const c of cases) {
      it(`${c.name}：确认轮回落 → 不判 FAIL（exit 0），逐行标注「末轮回落」`, () => {
        writeRound("raw", { searchMedian: c.r1, probeMs: PROBE_OK });
        writeRound("raw-retest", { searchMedian: c.r2, probeMs: PROBE_OK });
        writeRound("raw-retest2", { searchMedian: c.r3, probeMs: PROBE_OK });
        perf.writeConfirmCandidates([ID]);

        const result = runReport("final");

        // 核心断言：修复前这里是 FAIL + exit 1（假 FAIL）
        expect(report()).not.toContain("| FAIL");
        expect(result.status).toBe(0);
        // 逐行必须写明回落原因（读者要能看到「为什么不是 FAIL」）
        expect(row("searchMs")).toContain("WARN（末轮回落（抖动））");
        // 确认轮那一列必须披露数值
        expect(row("searchMs")).toContain(`| ${c.r3} |`);
        // 不得进 UNCONFIRMED（三轮都测到了、确认轮也可信）
        expect(latest().unconfirmed).toEqual([]);
        expect(latest().rounds).toEqual({ measured: true, retest: true, confirm: true });
      });
    }

    it("确认轮候选为空但存在双超（老产物：没有 retest2.json）→ 绝不判 FAIL，落 UNCONFIRMED", () => {
      // 向后兼容边界：老产物 / 手工拼装的产物没有 retest2.json。
      // 此时 final 读不到候选清单，而 R1∧R2 双超成立 → 必须落 UNCONFIRMED 而不是 FAIL。
      writeRound("raw", { searchMedian: 549.5, probeMs: PROBE_OK });
      writeRound("raw-retest", { searchMedian: 584.1, probeMs: PROBE_OK });
      // 故意不写 retest2.json，也不写 raw-retest2

      const result = runReport("final");

      expect(report()).not.toContain("| FAIL");
      expect(result.status).toBe(0); // PR 运行：披露 + 逐行 WARN，不阻断
      expect(row("searchMs")).toContain("WARN（未确认：确认轮未测量）");
      expect(latest().unconfirmed).toEqual([ID]);
    });

    it("同形态 + PERF_REQUIRE_COMPARISON=1（tag）→ exit 2：结论不完整 ≠ 没回归", () => {
      writeRound("raw", { searchMedian: 549.5, probeMs: PROBE_OK });
      writeRound("raw-retest", { searchMedian: 584.1, probeMs: PROBE_OK });
      // 有候选清单、但确认轮整轮没测到（一份采样都没有）
      perf.writeConfirmCandidates([ID]);

      const result = runReport("final", { requireComparison: true });

      // 确认轮整轮缺失是**链路故障**，PR 与 tag 一律 exit 2（复用「未测量」语义）
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("确认轮整轮未测量");
      expect(report()).not.toContain("| FAIL");
    });
  });

  // ── 2. 真回归：护栏，本 issue 不能把真回归也降级掉 ──────────────────────
  it("三轮都超 → 确认 FAIL + exit 1（护栏：真回归不许被降级）", () => {
    writeRound("raw", { searchMedian: 549.5, probeMs: PROBE_OK });
    writeRound("raw-retest", { searchMedian: 584.1, probeMs: PROBE_OK });
    writeRound("raw-retest2", { searchMedian: 601.3, probeMs: PROBE_OK });
    perf.writeConfirmCandidates([ID]);

    const result = runReport("final");

    // searchMs 的 median 行超阈值（三轮都超）→ FAIL
    expect(row("searchMs")).toContain("FAIL（复测仍超阈值 + 末轮仍超）");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("相对回归确认（3 轮均超阈值）");
    // 真回归不得进 UNCONFIRMED
    expect(latest().unconfirmed).toEqual([]);
  });

  it("p95 单独成行参与判定：p95 三轮都超 → 该行也 FAIL（#216 起的既有语义）", () => {
    // searchMs.p95 的阈值是 25%（DEFAULT_PCT 15 + P95_EXTRA_PCT 10），
    // 基线 p95 参考 500 → 门槛 625。故 p95 取 640 才超（median 仍取 549.5 那一档）。
    const p95Round = (med: number, p95: number): RoundOptions => ({ searchMedian: med, searchP95: p95, probeMs: PROBE_OK });
    writeRound("raw", p95Round(520, 640));
    writeRound("raw-retest", p95Round(530, 655));
    writeRound("raw-retest2", p95Round(540, 660));
    perf.writeConfirmCandidates([ID]);

    const result = runReport("final");

    expect(row("searchMs.p95")).toContain("FAIL（复测仍超阈值 + 末轮仍超）");
    expect(result.status).toBe(1);
  });

  // ── 3. 确认轮不可信：它自己越界就不许确认 FAIL（D2）─────────────────────
  describe("确认轮标定越界 / 缺指标（D2）", () => {
    it("R3 标定越界 + R3 超阈 + PERF_REQUIRE_COMPARISON=1 → WARN 未确认 + exit 2", () => {
      writeRound("raw", { searchMedian: 549.5, probeMs: PROBE_OK });
      writeRound("raw-retest", { searchMedian: 584.1, probeMs: PROBE_OK });
      // 确认轮：指标仍超阈值，但它那台机器慢到标定越界 → 不足以确认 FAIL
      writeRound("raw-retest2", { searchMedian: 601.3, probeMs: PROBE_SLOW });
      perf.writeConfirmCandidates([ID]);

      const result = runReport("final", { requireComparison: true });

      expect(row("searchMs")).toContain("WARN（未确认：确认轮环境不可信）");
      expect(report()).not.toContain("| FAIL");
      expect(result.status).toBe(2);
      expect(latest().unconfirmed).toEqual([ID]);
      // 报告必须显式说明「确认轮环境不可信」，否则读者会以为判定漏掉了
      expect(report()).toContain("确认轮环境异常");
    });

    it("R3 标定越界 + PR 运行 → exit 0，但逐行 WARN + 披露 UNCONFIRMED", () => {
      writeRound("raw", { searchMedian: 549.5, probeMs: PROBE_OK });
      writeRound("raw-retest", { searchMedian: 584.1, probeMs: PROBE_OK });
      writeRound("raw-retest2", { searchMedian: 601.3, probeMs: PROBE_SLOW });
      perf.writeConfirmCandidates([ID]);

      const result = runReport("final");

      expect(result.status).toBe(0); // PR 运行不阻断（issue #216 既定要求）
      expect(result.stderr).not.toContain("相对回归确认");
      expect(report()).toContain("未确认：1 个场景");
    });

    it("R3 标定在范围内 → 正常参与终判（#259：范围内不等于排除环境，但要能判 FAIL）", () => {
      writeRound("raw", { searchMedian: 549.5, probeMs: PROBE_OK });
      writeRound("raw-retest", { searchMedian: 584.1, probeMs: PROBE_OK });
      // 44ms 未超门槛 48.4 —— 刻意贴着边界内侧，确认"范围内 → 正常判 FAIL"
      writeRound("raw-retest2", { searchMedian: 601.3, probeMs: PROBE_EDGE });
      perf.writeConfirmCandidates([ID]);

      const result = runReport("final");

      expect(row("searchMs")).toContain("FAIL（复测仍超阈值 + 末轮仍超）");
      expect(result.status).toBe(1);
      expect(latest().unconfirmed).toEqual([]);
    });
  });

  // ── 4. confirm 相位：产出候选清单（编排信号，退出码恒 0）───────────────
  describe("confirm 相位（候选清单产出）", () => {
    it("R1∧R2 双超 → 场景进 retest2.json，exit 0（不构成结论）", () => {
      writeRound("raw", { searchMedian: 549.5, probeMs: PROBE_OK });
      writeRound("raw-retest", { searchMedian: 584.1, probeMs: PROBE_OK });

      const result = runReport("confirm");

      expect(result.status).toBe(0); // 编排信号，不是结论
      expect(idList("retest2.json")).toEqual([ID]);
      expect(result.stdout).toContain("1 个场景需要确认轮");
    });

    it("复测回落 → 不进候选（确认轮只跑双超的场景，不白付一轮成本）", () => {
      writeRound("raw", { searchMedian: 549.5, probeMs: PROBE_OK });
      writeRound("raw-retest", { searchMedian: 427.5, probeMs: PROBE_OK });

      expect(runReport("confirm").status).toBe(0);
      expect(idList("retest2.json")).toEqual([]);
    });

    it("R2 标定越界 → 即使指标没双超也进候选（环境不可信，不许就地确认）", () => {
      // 首轮与复测都没超阈值，但复测那台机器慢到标定越界：
      // 那一轮的数值可能被机器档位放大，不能用它下「无回归」的结论。
      writeRound("raw", { searchMedian: 477, probeMs: PROBE_OK });
      writeRound("raw-retest", { searchMedian: 480, probeMs: PROBE_SLOW });

      expect(runReport("confirm").status).toBe(0);
      expect(idList("retest2.json")).toEqual([ID]);
    });

    it("R2 无标定数据（老产物）→ 不触发标定候选（缺失不判）", () => {
      // 只靠双超触发：标定缺失不得被当成「越界」，也不得伪造 0
      writeRound("raw", { searchMedian: 477 });
      writeRound("raw-retest", { searchMedian: 480 });

      expect(runReport("confirm").status).toBe(0);
      expect(idList("retest2.json")).toEqual([]);
    });

    it("两轮都未超 → 无候选", () => {
      writeRound("raw", { searchMedian: 477, probeMs: PROBE_OK });
      writeRound("raw-retest", { searchMedian: 480, probeMs: PROBE_OK });

      expect(runReport("confirm").status).toBe(0);
      expect(idList("retest2.json")).toEqual([]);
    });
  });

  // ── 5. 三轮佐证（#270 扩轮）───────────────────────────────────────────
  it("主指标 R1∧R2 超但 R3 回落 → 派生指标不得判 FAIL（#270 语义在第三轮仍成立）", () => {
    // searchMs（主指标）走末轮回落；longTaskMs（派生）三轮都超。
    // 若佐证基准仍只看两轮，主指标会被误当成"复现"，给派生指标发豁免券 → exit 1。
    const withDerived = (searchMedian: number, longTaskMs: number) => {
      const raw = rawFor({ searchMedian, probeMs: PROBE_OK }) as {
        scalars: Record<string, number>;
      };
      raw.scalars.longTaskMs = longTaskMs;
      return raw;
    };
    const write = (dir: RoundDir, searchMedian: number, longTaskMs: number) =>
      writeFileSync(
        join(dirPath(dir), `${ID}.json`),
        JSON.stringify(withDerived(searchMedian, longTaskMs), null, 2),
        "utf8",
      );

    // 基线里补上 longTaskMs（派生指标），阈值 50% + 地板 100ms（见 judgment.METRIC_RULES）
    const baselineFile = join(perf.baselineDir, "local", "quick", "headless", "r2", `${ID}.json`);
    const baseline = JSON.parse(readFileSync(baselineFile, "utf8"));
    baseline.metrics.longTaskMs = {
      median: 300,
      p95: null,
      max: null,
      n: null,
      scalar: true,
      history: [300, 302, 298, 305, 295, 301, 299, 303],
    };
    writeFileSync(baselineFile, JSON.stringify(baseline, null, 2), "utf8");

    // 主指标：549.5 / 584.1 双超 → 427.5 回落（判 WARN，不构成主指标佐证）
    // 派生指标：500 / 520 / 530 三轮都超 50% 阈值与 100ms 地板
    write("raw", 549.5, 500);
    write("raw-retest", 584.1, 520);
    write("raw-retest2", 427.5, 530);
    perf.writeConfirmCandidates([ID]);

    const result = runReport("final");

    // 主指标末轮回落 → 不算复现
    expect(row("searchMs")).toContain("WARN（末轮回落（抖动））");
    // 派生指标三轮都超，但主指标没复现 → 无佐证，只能 WARN
    expect(row("longTaskMs")).toContain("WARN（派生指标无主指标佐证（疑似运行抖动））");
    expect(report()).not.toContain("| FAIL");
    expect(result.status).toBe(0);
  });

  // ── 6. 报告结构：新增列与披露行 ────────────────────────────────────────
  it("报告新增「复测2」列与判定轮次披露行（三轮证据强度必须可见）", () => {
    writeRound("raw", { searchMedian: 549.5, probeMs: PROBE_OK });
    writeRound("raw-retest", { searchMedian: 584.1, probeMs: PROBE_OK });
    writeRound("raw-retest2", { searchMedian: 601.3, probeMs: PROBE_OK });
    perf.writeConfirmCandidates([ID]);

    runReport("final");

    expect(report()).toContain("| 场景 | 指标 | baseline | 本次 | 复测 | 复测2 | 变化 | 3σ（占参考） | 判定 |");
    expect(report()).toContain("- 判定轮次：首轮 ✓　复测 ✓　确认 ✓");
    expect(report()).toContain("1 个场景进入 retest-2");
  });

  it("未参与确认轮的行，复测2 列填「—」（空单元格会被读成「测了但没数据」）", () => {
    // 无候选、无确认轮数据：R2 回落即止步，确认轮那一列必须是「—」
    writeRound("raw", { searchMedian: 549.5, probeMs: PROBE_OK });
    writeRound("raw-retest", { searchMedian: 427.5, probeMs: PROBE_OK });

    const result = runReport("final");

    expect(row("searchMs")).toContain("WARN（复测回落（抖动））");
    expect(row("searchMs")).toContain("| — |");
    expect(result.status).toBe(0);
    expect(latest().rounds).toEqual({ measured: true, retest: true, confirm: false });
  });

  it("两轮路径（无复测）不受影响：无复测轮的行仍落 WARN「未复测」，exit 0", () => {
    // 没有 suspects 的常规运行：只测首轮就走 final，必须保持既有语义
    writeRound("raw", { searchMedian: 549.5, probeMs: PROBE_OK });

    const result = runReport("final");

    expect(row("searchMs")).toContain("WARN（未复测）");
    expect(report()).not.toContain("| FAIL");
    expect(result.status).toBe(0);
    expect(latest().rounds).toEqual({ measured: true, retest: false, confirm: false });
  });
});
