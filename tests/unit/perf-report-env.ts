// 子进程调用 report.mjs 的隔离环境（测试专用，非测试文件）
//
// 为什么需要它：report.mjs 有**四个**可被环境变量重定向的目录——
// OUT（报告）/ RAW（首轮采样）/ RETEST（复测采样）/ BASELINE（基线）。
// 测试必须四个全给：漏掉任何一个，子进程就会去读或**写**真实仓库里的对应目录。
// 用例 E 早期只覆盖了前三个，BASELINE 落到真实 `.perf-baseline/`，靠"合成场景 id 不会撞名"
// 这个隐式假设保证安全——一旦外部 shell 设置了 `PERF_BASELINE_DIR`（`...process.env` 会透传）
// 或将来提交了同名基线，判定就会被意外数据影响。
//
// 所以隔离标准集中在这里，而不是让每个端到端测试各写一份（那样迟早漂移）。
// 另外提供 `assertRepoBaselineUntouched()`：断言真实基线目录在测试前后**完全未变**，
// 把"忘了重定向新目录"这类错误变成显式失败，而不是悄悄污染仓库。

import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "vitest";

/** 真实仓库基线目录（相对 cwd；vitest 以仓库根为 cwd） */
const REPO_BASELINE_DIR = ".perf-baseline";

export interface PerfReportWorkspace {
  root: string;
  rawDir: string;
  retestDir: string;
  outDir: string;
  baselineDir: string;
  /** 传给子进程的环境：四个目录全部指向临时目录；extra 可覆盖单项（如 PERF_ABSOLUTE） */
  env(extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
  /** 断言真实仓库的 .perf-baseline 未被本次测试改动（在任何子进程调用之后使用） */
  assertRepoBaselineUntouched(): void;
  cleanup(): void;
}

/** 递归快照：相对路径 → `${size}:${mtimeMs}` */
function snapshotBaseline(): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(REPO_BASELINE_DIR)) return out;
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = `${prefix}${entry.name}`;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs, `${rel}/`);
      } else {
        const stat = statSync(abs);
        out[rel] = `${stat.size}:${stat.mtimeMs}`;
      }
    }
  };
  walk(REPO_BASELINE_DIR, "");
  return out;
}

export function createPerfReportWorkspace(prefix = "perf-report-"): PerfReportWorkspace {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const rawDir = join(root, "raw");
  const retestDir = join(root, "raw-retest");
  const outDir = join(root, "out");
  const baselineDir = join(root, "baseline");
  for (const dir of [rawDir, retestDir, outDir, baselineDir]) {
    mkdirSync(dir, { recursive: true });
  }
  const before = snapshotBaseline();

  return {
    root,
    rawDir,
    retestDir,
    outDir,
    baselineDir,
    env(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
      // 先剥掉父进程继承的**所有** `PERF_*`：开发者在 shell 里 export 过的
      // PERF_ABSOLUTE / PERF_REQUIRE_COMPARISON / PERF_PROFILE / PERF_SCENARIO …
      // 会静默改变被测行为，让用例假通过或假失败（实测：shell 里 export
      // PERF_REQUIRE_COMPARISON=1 后，「守卫关闭 → exit 0」用例变成 `expected 2 to be +0`）。
      // 需要哪一项就在 extra 里**显式**给出——包括显式给出空值以外的一切场景。
      const inherited: NodeJS.ProcessEnv = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (!key.startsWith("PERF_")) inherited[key] = value;
      }
      return {
        ...inherited,
        PERF_OUT_DIR: outDir,
        PERF_RAW_DIR: rawDir,
        PERF_RETEST_DIR: retestDir,
        PERF_BASELINE_DIR: baselineDir,
        ...extra,
      };
    },
    assertRepoBaselineUntouched(): void {
      expect(snapshotBaseline()).toEqual(before);
    },
    cleanup(): void {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
