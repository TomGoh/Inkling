// 基线历史累积策略的端到端测试（P1 回归锁）
//
// 背景：`withHistory`（决定 3σ 与滚动参考值）早期只查 fixture 就判定"可比"，
// 于是「headless 日常回归建基线 → 切 uncapped 做定向验证并 --update-baseline」
// 会把两种测量模式的聚合值混进同一条 history：
//   [16.8, 16.8, 16.8] → [16.8, 16.8, 16.8, 8.5]
// σ 被污染成 ≈4.4ms、3σ≈13ms，真实的 8.4→11ms 回归会被「变化在运行噪声内」吞掉。
//
// 累积侧的可比性必须与比较侧（comparability.js 五维）同一套规则。
// 这里用子进程真实调用 report.mjs，断言"不同 mode/rounds/fixture 不得合并历史"。

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const REPORT = "tests/perf/report.mjs";
const ID = "scroll-H-test";
const FIXTURE = { version: 2, hash: "histtest0001", lines: 1000, source: "generated:rich" };

const roots: string[] = [];
let root = "";
let rawDir = "";
let baselineDir = "";

function newWorkspace(): void {
  root = mkdtempSync(join(tmpdir(), "perf-hist-"));
  roots.push(root);
  rawDir = join(root, "raw");
  baselineDir = join(root, "baseline");
  for (const dir of [rawDir, baselineDir, join(root, "out"), join(root, "retest")]) {
    mkdirSync(dir, { recursive: true });
  }
}

interface RawOptions {
  mode?: string;
  rounds?: number;
  frameMedian?: number;
  fixtureHash?: string;
}

function writeRaw({ mode = "headless", rounds = 2, frameMedian = 16.7, fixtureHash = FIXTURE.hash }: RawOptions): void {
  const raw = {
    id: ID,
    scenario: "scroll",
    tier: "S",
    kind: "rich",
    env: "local",
    profile: "quick",
    rounds,
    warmups: 1,
    mode,
    absoluteEligible: mode !== "headless",
    fixture: { ...FIXTURE, hash: fixtureHash },
    samples: { frameMs: Array.from({ length: 120 }, (_, i) => frameMedian + (i % 3) * 0.1) },
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
  writeFileSync(join(rawDir, `${ID}.json`), JSON.stringify(raw, null, 2), "utf8");
}

function updateBaseline(): string {
  return execFileSync(
    process.execPath,
    [REPORT, "--phase=final", "--update-baseline=1"],
    {
      env: {
        ...process.env,
        PERF_OUT_DIR: join(root, "out"),
        PERF_RAW_DIR: rawDir,
        PERF_RETEST_DIR: join(root, "retest"),
        PERF_BASELINE_DIR: baselineDir,
      },
      encoding: "utf8",
    },
  );
}

function baselineFile(): string {
  return join(baselineDir, "local", "quick", `${ID}.json`);
}

function currentBaseline(): {
  mode: string;
  rounds: number;
  schemaVersion: number;
  metrics: Record<string, { history?: number[]; historyP95?: number[] }>;
} {
  return JSON.parse(readFileSync(baselineFile(), "utf8"));
}

function frameHistory(): number[] {
  return currentBaseline().metrics.frameMs?.history ?? [];
}

beforeEach(() => {
  newWorkspace();
});

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

describe("基线历史累积的可比性", () => {
  it("同 env/profile/mode/rounds/fixture：历史逐次累积", () => {
    writeRaw({ frameMedian: 16.7 });
    updateBaseline();
    writeRaw({ frameMedian: 16.8 });
    updateBaseline();
    writeRaw({ frameMedian: 16.9 });
    updateBaseline();

    expect(frameHistory()).toHaveLength(3);
  });

  it("P1 回归锁：测量模式切换后历史必须重新起头，不得混入不同模式的值", () => {
    for (const frameMedian of [16.7, 16.7, 16.7]) {
      writeRaw({ mode: "headless", frameMedian });
      updateBaseline();
    }
    expect(frameHistory()).toHaveLength(3);

    // 切到 uncapped 做定向验证（同一 env/profile/id → 同一个基线文件）
    writeRaw({ mode: "uncapped", frameMedian: 8.4 });
    const out = updateBaseline();

    expect(frameHistory()).toEqual([8.5]); // 只有本次的值，headless 的 16.8 不得混入
    expect(currentBaseline().mode).toBe("uncapped");
    expect(out).toContain("基线历史重新起头");
    expect(out).toContain("MODE_MISMATCH");
  });

  it("采样轮数变化后历史重新起头（样本量不同，散布不可比）", () => {
    writeRaw({ rounds: 2 });
    updateBaseline();
    writeRaw({ rounds: 2 });
    updateBaseline();
    expect(frameHistory()).toHaveLength(2);

    writeRaw({ rounds: 3 });
    const out = updateBaseline();
    expect(frameHistory()).toHaveLength(1);
    expect(out).toContain("ROUNDS_MISMATCH");
  });

  it("fixture 变化后历史重新起头（测的不是同一份文档）", () => {
    writeRaw({});
    updateBaseline();
    writeRaw({});
    updateBaseline();
    expect(frameHistory()).toHaveLength(2);

    writeRaw({ fixtureHash: "anotherhash1" });
    const out = updateBaseline();
    expect(frameHistory()).toHaveLength(1);
    expect(out).toContain("FIXTURE_CHANGED");
  });

  it("旧 schema 基线（无历史序列）不会被当成一个历史点重复计入", () => {
    writeRaw({});
    updateBaseline();
    // 手工降级为 schemaVersion 1（模拟本 PR 之前的基线）
    const file = baselineFile();
    const legacy = JSON.parse(readFileSync(file, "utf8"));
    legacy.schemaVersion = 1;
    for (const entry of Object.values<Record<string, unknown>>(legacy.metrics)) {
      delete entry.history;
      delete entry.historyP95;
    }
    writeFileSync(file, JSON.stringify(legacy, null, 2), "utf8");

    updateBaseline();
    expect(frameHistory()).toHaveLength(1); // 从本次重新起头，而不是 [median, median]
  });

  it("历史序列上限 8 点，保留最近的运行", () => {
    for (let i = 0; i < 11; i += 1) {
      writeRaw({ frameMedian: 16 + i * 0.1 });
      updateBaseline();
    }
    const history = frameHistory();
    expect(history).toHaveLength(8);
    expect(history[history.length - 1]).toBeGreaterThan(history[0]); // 保留尾部
  });
});
