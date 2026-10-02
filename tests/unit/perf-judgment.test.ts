// 判定策略测试（issue #216 第三轮）
//
// 背景：这些阈值是拿真实 CI 采样标定出来的——同一份代码在共享 runner 上，
// longTaskMs 能自然波动 +25%~+36%（绝对值 +34ms~+329ms）。若只看默认 15%，
// 每次 CI 都会产出若干"回归"，而它们既无代码变更也无主指标佐证。
//
// 这里把标定值与分层规则锁死：改阈值必须同步改测试，避免悄悄放宽判定。

import { describe, expect, it } from "vitest";
import {
  baseMetric,
  confirmVerdict,
  COUNT_FLOOR_FACTOR,
  COUNT_METRICS,
  COUNT_SMALL_BASE,
  DEFAULT_PCT,
  effectiveAbsMin,
  historyFloor,
  isOver,
  isPrimary,
  isRaisedFloor,
  median,
  METRIC_RULES,
  NOISE_MIN_POINTS,
  NOISE_SIGMA,
  noiseFor,
  noiseThreshold,
  P95_EXTRA_PCT,
  REFERENCE_WINDOW,
  referenceValue,
  requiresPrimaryCorroboration,
  RESOLUTION_WARN_PCT,
  resolutionPct,
  ruleFor,
  sampleSd,
  suppressionReason,
} from "../perf/judgment.js";

describe("阈值规则解析", () => {
  it("未登记指标用默认 15%；p95 行在基础值上放宽 10 个百分点", () => {
    expect(ruleFor("ttiMs").pct).toBe(DEFAULT_PCT);
    expect(ruleFor("ttiMs.p95").pct).toBe(DEFAULT_PCT + P95_EXTRA_PCT);
    expect(ruleFor("switchMs.p95").pct).toBe(25);
  });

  it("已登记指标返回自身规则，绝对值类指标用 abs", () => {
    expect(ruleFor("longTaskMs")).toEqual({ pct: 50, absMin: 100 });
    expect(ruleFor("longTaskCount")).toEqual({ pct: 20, absMin: 5 });
    expect(ruleFor("cls")).toEqual({ abs: 0.02 });
  });

  it("基础指标名解析（.p95 行的分层与规则都继承基础指标）", () => {
    expect(baseMetric("frameMs.p95")).toBe("frameMs");
    expect(baseMetric("frameMs")).toBe("frameMs");
  });
});

describe("单指标超阈值判定", () => {
  it("基数为 0 时百分比无意义，退化为绝对增量门槛", () => {
    // jankRatePct 的 absMin=5
    expect(isOver("jankRatePct", 4, 0)).toBe(false);
    expect(isOver("jankRatePct", 12, 0)).toBe(true);
  });

  it("同时带 pct 与 absMin 时必须两者都成立", () => {
    // 20 → 25：+25% 未到 50%
    expect(isOver("jankRatePct", 25, 20)).toBe(false);
    // 20 → 40：+100% 且 +20
    expect(isOver("jankRatePct", 40, 20)).toBe(true);
  });

  it("绝对增量型指标（cls）与增量门槛型指标（longTaskCount）", () => {
    expect(isOver("cls", 0.01, 0)).toBe(false);
    expect(isOver("cls", 0.03, 0)).toBe(true);

    // longTaskCount：+1 次不判，+6 次判
    expect(isOver("longTaskCount", 2, 1)).toBe(false);
    expect(isOver("longTaskCount", 7, 1)).toBe(true);
    expect(isOver("longTaskCount", 3, 0)).toBe(false);
  });
});

describe("longTaskMs 标定值（依据真实 CI 噪声样本）", () => {
  // 同一份代码、无任何变更时实测到的 5 个样本，必须全部不判超阈值
  const noiseSamples: Array<[string, number, number]> = [
    ["open-S-plain", 170, 136],
    ["open-M-plain", 478, 402],
    ["tab-switch-S-rich", 488, 419],
    ["tab-switch-M-rich", 2213, 1884],
    ["open-S-rich", 308, 227],
  ];

  it.each(noiseSamples)("%s：%d vs 基线 %d 不判超阈值", (_name, cur, base) => {
    expect(isOver("longTaskMs", cur, base)).toBe(false);
  });

  it("真正的成倍恶化仍然判超阈值", () => {
    expect(isOver("longTaskMs", 250, 136)).toBe(true); // +83.8%、+114ms
    expect(isOver("longTaskMs", 500, 227)).toBe(true); // +120.3%、+273ms
  });

  it("只有绝对增量达标但涨幅不足时不判（避免大基数误判）", () => {
    // tab-switch-M-rich 的量级：+200ms 但仅 +10.6%
    expect(isOver("longTaskMs", 2084, 1884)).toBe(false);
  });
});

describe("小量级主指标的绝对地板（依据同代码重复实测）", () => {
  it("inputSyncMs：CI 曾因 Δ0.3ms 开出假 FAIL，地板 1ms 应拦住", () => {
    // 同代码实测中位数：本机 1.5/1.6/2.0，CI 1.9/2.2/2.5
    expect(isOver("inputSyncMs", 2.2, 1.9)).toBe(false); // +15.8%、Δ0.3ms ← 真实发生过的假 FAIL
    expect(isOver("inputSyncMs", 2.5, 1.9)).toBe(false); // +31.6%、Δ0.6ms
    expect(isOver("inputSyncMs", 2.0, 1.5)).toBe(false); // +33.3%、Δ0.5ms
  });

  it("inputSyncMs：真正的同步耗时上升仍会被判超标", () => {
    expect(isOver("inputSyncMs", 3.0, 1.6)).toBe(true); // +87.5%、Δ1.4ms
    expect(isOver("inputSyncMs", 4.2, 1.9)).toBe(true); // +121%、Δ2.3ms
  });

  it("saveMs：同代码实测散布 4.6ms，地板 8ms 应拦住贴线噪声", () => {
    expect(isOver("saveMs", 38, 34)).toBe(false); // +11.8%、Δ4ms
    expect(isOver("saveMs", 38, 33.4)).toBe(false); // +13.8%、Δ4.6ms
  });

  it("saveMs：真正的恶化仍会被判超标", () => {
    expect(isOver("saveMs", 48, 34)).toBe(true); // +41.2%、Δ14ms
  });

  it(".p95 行必须继承基础指标的绝对地板（否则 2ms 量级的尾部仍被噪声顶过）", () => {
    expect(ruleFor("inputSyncMs.p95")).toEqual({ pct: 25, absMin: 1 });
    expect(isOver("inputSyncMs.p95", 2.4, 1.9)).toBe(false); // Δ0.5ms
    expect(isOver("inputSyncMs.p95", 3.4, 1.9)).toBe(true); // Δ1.5ms
  });
});

describe("指标分层与佐证要求", () => {
  it("主指标可单独判 FAIL，其 p95 行继承主指标身份", () => {
    for (const metric of ["ttiMs", "frameMs", "switchMs", "searchMs", "saveMs"]) {
      expect(isPrimary(metric)).toBe(true);
      expect(isPrimary(`${metric}.p95`)).toBe(true);
      expect(requiresPrimaryCorroboration(metric)).toBe(false);
      expect(requiresPrimaryCorroboration(`${metric}.p95`)).toBe(false);
    }
  });

  it("派生指标与未知指标都需要主指标佐证", () => {
    for (const metric of [
      "longTaskMs",
      "longTaskCount",
      "longFrameCount",
      "jankCount",
      "jankRatePct",
      "cls",
      "heapDeltaMB",
    ]) {
      expect(isPrimary(metric)).toBe(false);
      expect(requiresPrimaryCorroboration(metric)).toBe(true);
    }
    // 未登记的新指标默认纳入"需佐证"一侧（"能单独判 FAIL"需要显式登记）
    expect(requiresPrimaryCorroboration("someFutureMetric")).toBe(true);
  });

  it("绝对判定行的指标名不参与分层（由调用方按 absolute 标记豁免）", () => {
    expect(isPrimary("frameMs.p95(绝对)")).toBe(false);
  });

  it("METRIC_RULES 的键必须是已登记比较的派生标量或小量级主指标", () => {
    expect(Object.keys(METRIC_RULES).sort()).toEqual(
      [
        "cls",
        "heapDeltaMB",
        "inputSyncMs",
        "jankCount",
        "jankRatePct",
        "longFrameCount",
        "longTaskCount",
        "longTaskMs",
        "saveMs",
      ].sort(),
    );
  });
});

// ── 噪声门槛（第四轮）：用基线自身的历史散布替代手工常数 ──
//
// 依据是 5 次同代码 CI 运行的实测：inputSyncMs 的 5 次中位数是 [1.9, 1.3, 1.2, 2.2, 1.6]，
// σ=0.42 → 3σ=1.25ms；而 15% 阈值在 1.9ms 上只等于 0.29ms——之前的假 FAIL 就出在这里。

describe("统计工具", () => {
  it("median 与 sampleSd（n-1）", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
    expect(sampleSd([2, 2, 2])).toBe(0);
    expect(sampleSd([1])).toBeNull();
    expect(sampleSd([1, 3])).toBeCloseTo(1.414, 2);
  });

  it("noiseThreshold：点数不足或零方差时不启用（返回 null）", () => {
    expect(noiseThreshold(undefined)).toBeNull();
    expect(noiseThreshold([1, 2])).toBeNull(); // < NOISE_MIN_POINTS
    expect(noiseThreshold([2, 2, 2])).toBeNull(); // σ=0（量化型指标）
    // 真实 inputSyncMs 历史 → 3σ ≈ 1.25
    expect(noiseThreshold([1.9, 1.3, 1.2, 2.2, 1.6])).toBeCloseTo(1.25, 1);
    expect(NOISE_SIGMA).toBe(3);
    expect(NOISE_MIN_POINTS).toBe(3);
  });

  it("referenceValue：取「全历史中位数」与「最近 4 点中位数」的较高者，历史不足时用点值", () => {
    // 全历史中位数 1.6 > 近况 1.45 → 取 1.6（窗口只允许上抬，见 #270 方案 C 的说明）
    const entry = { median: 1.9, history: [1.9, 1.3, 1.2, 2.2, 1.6] };
    expect(referenceValue(entry)).toBe(1.6);
    expect(referenceValue({ median: 1.9, history: [1.9, 1.3] })).toBe(1.9); // 点值
    expect(referenceValue({ median: 1.9 })).toBe(1.9);
    // 真实样本：scroll-M-rich.longFrameCount 的全历史中位数 0.75、近况 1.25 → 上抬到 1.25
    expect(referenceValue({ median: 0.75, history: [0, 1, 0, 1, 0.5, 0.5, 3, 2] })).toBe(1.25);
    // 反方向（近况低于全历史）不下压：全历史中位数 3、近况 1 → 仍取 3。
    // 下压会把判定系统性推向偏严（实测反例见 #270）
    expect(referenceValue({ median: 5, history: [5, 5, 5, 5, 1, 1, 1, 1] })).toBe(3);
    // p95 走 historyP95：全历史 2.8 < 近况 2.9 → 取 2.9
    const withP95 = { median: 2.4, historyP95: [2.4, 3.0, 2.6, 2.8, 3.1] };
    expect(referenceValue(withP95, "p95")).toBe(2.9);
    expect(REFERENCE_WINDOW).toBe(4);
    // 散布估计不跟着缩窗（σ 的稳定性依赖点数）
    expect(noiseFor(entry)).toBeCloseTo(1.25, 1);
    expect(noiseFor({ historyP95: [2.4, 3.0, 2.6, 2.8, 3.1] }, "p95")).toBeCloseTo(
      0.81,
      1,
    );
  });
});

// 小基数计数指标的历史推导地板（issue #270 方案 B）
//
// 依据：这类指标的参考值只有个位数，百分比规则等于把小差异无限放大（0.75 → 4 就是 +433%），
// 而手写常数又常比该指标**自身**的跨运行散布还小。实测数据来自 quick 档基线
// （`.perf-baseline/quick/headless/r2/`）。
describe("小基数计数指标的历史推导地板（#270 方案 B）", () => {
  /** scroll-M-rich.longFrameCount 的真实 history：极差 3（0~3），参考值（窗口上抬后）1.25 */
  const scrollLongFrame = { median: 0.75, history: [0, 1, 0, 1, 0.5, 0.5, 3, 2] };

  it("登记常数与推导下限取较大者，且推导下限 = 1.5×历史极差", () => {
    expect(COUNT_FLOOR_FACTOR).toBe(1.5);
    expect(COUNT_METRICS).toEqual(["longFrameCount", "jankCount", "longTaskCount"]);
    expect(historyFloor(scrollLongFrame, "longFrameCount")).toBeCloseTo(4.5, 6);
    expect(effectiveAbsMin(scrollLongFrame, "longFrameCount")).toBeCloseTo(4.5, 6);
  });

  it("本 issue 的实测行不再判超阈值（Δ3.25 < 地板 4.5，且 3σ=3.11 拦不住）", () => {
    const floor = effectiveAbsMin(scrollLongFrame, "longFrameCount");
    // 复测 4.5、参考值 1.25、3σ 3.11：没有推导地板时 Δ3.25 > 3σ → 会被判 FAIL
    expect(isOver("longFrameCount", 4.5, 1.25, 3.11, floor)).toBe(false);
    expect(suppressionReason("longFrameCount", 4.5, 1.25, 3.11, floor)).toBe("floor");
    // 对照：不给地板（旧行为）时同一行确实超阈值
    expect(isOver("longFrameCount", 4.5, 1.25, 3.11, 3)).toBe(true);
  });

  it("真正的成倍恶化仍判超阈值（地板不许把真回归一起收掉）", () => {
    const floor = effectiveAbsMin(scrollLongFrame, "longFrameCount");
    // 健康水平 1.25 → 真实劣化到 8：Δ6.75 ≥ 4.5、+540%、超 3σ
    expect(isOver("longFrameCount", 8, 1.25, 3.11, floor)).toBe(true);
  });

  it("只收紧不放松：登记常数更大时保留登记值", () => {
    // jankCount 真实 history：极差 3 → 推导 4.5，小于登记常数 6
    const entry = { median: 4.5, history: [2, 4.5, 4.5, 4.5, 3.5, 4.5, 5, 3.5] };
    expect(historyFloor(entry, "jankCount")).toBeCloseTo(4.5, 6);
    expect(effectiveAbsMin(entry, "jankCount")).toBe(6);
  });

  it("大基数（参考值 ≥10）场景不额外收紧：百分比规则本就有效", () => {
    // full 档 scroll-L 的真实量级：参考值 ~131
    const big = {
      median: 134,
      history: [109.33, 148, 130, 141, 120, 133, 137, 126],
    };
    expect(referenceValue(big)).toBeGreaterThanOrEqual(COUNT_SMALL_BASE);
    expect(historyFloor(big, "longFrameCount")).toBeUndefined();
    expect(effectiveAbsMin(big, "longFrameCount")).toBe(3); // 退回登记常数
  });

  it("不适用于非计数指标，也不适用于绝对值型指标（cls）", () => {
    expect(historyFloor(scrollLongFrame, "frameMs")).toBeUndefined();
    expect(effectiveAbsMin(scrollLongFrame, "cls")).toBeUndefined();
  });

  it("历史不足 3 点、极差为 0 时不启用（退回登记常数）", () => {
    expect(historyFloor({ median: 0, history: [0, 0] }, "longFrameCount")).toBeUndefined();
    expect(historyFloor({ median: 0, history: [0, 0, 0] }, "longFrameCount")).toBeUndefined();
    expect(effectiveAbsMin({ median: 0, history: [0, 0, 0] }, "longFrameCount")).toBe(3);
  });
});

// 「生效地板被抬高」的披露判据（#274 / #285）。报告只在**推导值严格大于登记常数**时
// 把该行列进名单；无登记常数的指标不算「抬高」——否则会配上「登记常数不足」的措辞，
// 而那种指标根本没有登记常数（#285）。
describe("生效地板披露判据（#285）", () => {
  it("仅严格大于登记常数才算「抬高」（相等或更小都不是）", () => {
    expect(isRaisedFloor(3, 6)).toBe(true);
    expect(isRaisedFloor(3, 3)).toBe(false); // 恰好相等：地板没变（#274）
    expect(isRaisedFloor(3, 2)).toBe(false);
  });

  it("无登记常数时不列入：旧实现 `?? 0` 兜底会让 `floorDerived > 0` 恒真而误报", () => {
    // 场景：将来往 COUNT_METRICS 加一个不带 absMin 的指标——其地板完全来自历史散布，
    // 谈不上「登记常数不足以覆盖该指标自身的噪声」
    expect(isRaisedFloor(undefined, 6)).toBe(false);
    expect(isRaisedFloor(undefined, undefined)).toBe(false);
    expect(isRaisedFloor(3, undefined)).toBe(false);
  });

  it("与线上数据一致：longFrameCount 的历史推导值确实构成「抬高」", () => {
    // 与 #274 的端到端用例互补——这里断言线上实现本身，而非它的副本
    const derived = historyFloor({ median: 3, history: [3, 3, 7] }, "longFrameCount");
    expect(isRaisedFloor(METRIC_RULES.longFrameCount.absMin, derived)).toBe(true);
  });
});

describe("分辨率（3σ 占参考值）", () => {
  it("σ 可用时给出百分比；不可用时返回 null", () => {
    const history = [200, 280, 420];
    expect(resolutionPct({ median: 300, history })).toBeCloseTo(
      (3 * (sampleSd(history) as number) / (median(history) as number)) * 100,
      1,
    );
    expect(resolutionPct({ median: 1, history: [1, 1, 1] })).toBeNull(); // σ=0 → 无门槛
    expect(resolutionPct({ median: 1, history: [1, 2] })).toBeNull(); // <3 点
    expect(resolutionPct({ median: 0, history: [0, 0, 0] })).toBeNull(); // 参考值 0
    expect(resolutionPct(undefined)).toBeNull();
    // p95 走 historyP95
    expect(resolutionPct({ historyP95: [10, 20, 30] }, "p95")).toBeCloseTo(
      (3 * (sampleSd([10, 20, 30]) as number) / 20) * 100,
      1,
    );
  });

  it("提醒阈值 = 30%（默认劣化阈值的两倍：连 2 倍幅度的变化都测不出时才提醒）", () => {
    expect(RESOLUTION_WARN_PCT).toBe(30);
    expect(RESOLUTION_WARN_PCT).toBeGreaterThanOrEqual(2 * DEFAULT_PCT);
  });
});

describe("噪声门槛对判定的作用", () => {
  const NOISE = 1.25; // inputSyncMs 的 3σ（真实历史估计）

  it("变化超过 3σ 才算超阈值", () => {
    // Δ=4.8ms > 1.25 → 超阈值
    expect(isOver("inputSyncMs", 6.4, 1.6, NOISE)).toBe(true);
  });

  it("变化在 3σ 内 → 不算超阈值（但会被标注为被抑制，而非 PASS）", () => {
    expect(isOver("inputSyncMs", 2.7, 1.6, NOISE)).toBe(false);
    expect(suppressionReason("inputSyncMs", 2.7, 1.6, NOISE)).toBe("noise");
  });

  it("未启用噪声门槛（null）时退回百分比 + 绝对地板", () => {
    expect(isOver("inputSyncMs", 6.4, 1.6, null)).toBe(true);
    expect(isOver("inputSyncMs", 2.0, 1.6, null)).toBe(false); // 地板 1ms 拦下
  });

  it("suppressionReason 区分 floor / noise / 正常 PASS", () => {
    expect(suppressionReason("inputSyncMs", 2.0, 1.6, NOISE)).toBe("floor"); // Δ0.4 < 地板 1ms
    expect(suppressionReason("inputSyncMs", 2.7, 1.6, NOISE)).toBe("noise"); // 过地板、未过 3σ
    expect(suppressionReason("inputSyncMs", 1.5, 1.6, NOISE)).toBeNull(); // 改善
    expect(suppressionReason("ttiMs", 850, 800, 241)).toBeNull(); // +6% 未过 15%
    expect(suppressionReason("longTaskCount", 3, 0, null)).toBeNull(); // 基数为 0 走绝对增量
  });
});

// 多轮聚合（#294）：FAIL 必须由**第三个独立 runner** 上的会话确认。
//
// 背景：#234 把复测拆到新 runner 挡住了「单会话慢」，但挡不住**两个会话同时被拖慢**
// （共享 runner 池内跨工作流并发）。2026-09-30 实证 3 例 R1∧R2 双超 → 判 FAIL，
// 换 runner 静默复跑全部证伪。所以判定从两轮扩到三轮，聚合规则是「末轮仍超才算确认」。
describe("多轮聚合 confirmVerdict（#294）", () => {
  it("三轮都超 → 确认 FAIL（本 issue 要保住的能力：真回归不许被降级）", () => {
    expect(confirmVerdict([true, true, true])).toBe("fail");
  });

  it("末轮回落 → WARN（这正是 3 例假 FAIL 形态的拦截点）", () => {
    expect(confirmVerdict([true, true, false])).toBe("warn");
  });

  it("复测就回落 → WARN（不进确认轮）", () => {
    expect(confirmVerdict([true, false])).toBe("warn");
  });

  it("两轮都超也判 fail：纯函数的语义是「参与判定的每一轮都超」", () => {
    // report.mjs 不会把两轮结果当成确认 FAIL（缺确认轮一律落 UNCONFIRMED），
    // 但纯函数本身必须诚实：它只对**传入的轮次**负责，"没传"不等于"没超"。
    // 锁住这一点是为了防止有人后来把「缺测」塞成 false 混进数组。
    expect(confirmVerdict([true, true])).toBe("fail");
  });

  it("空数组 / 非数组 → pass（无任何轮次参与，无从谈起）", () => {
    expect(confirmVerdict([])).toBe("pass");
    expect(confirmVerdict(undefined as unknown as boolean[])).toBe("pass");
  });

  it("首轮未超 → 恒不为 fail（改善不可能被判回归）", () => {
    expect(confirmVerdict([false, true, true])).toBe("warn");
  });
});
