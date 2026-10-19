// 标题锚点表与匹配（#297）
//
// 背景：`#frag` 来自三种来源——本应用 TOC、GitHub 拷贝、手写。三者的 slug 形态并不统一：
// - 本应用 / GitHub：`hello-world`；
// - GitHub 重复标题：`hello-world-1`（后缀是 1-based 序号）；
// - Milkdown DOM id：`hello-world-#2`（`syncHeadingIdPlugin` 的计数是 1-based，
//   第 2 处是 `-#2` 而不是 `-#1` —— 实测 `node_modules/@milkdown/preset-commonmark/lib/index.js`
//   的 `idMap[id] += 1` 后再拼后缀，首处无后缀）。
//
// 设计文档 D2 里「第 2 处是 `-#1`」的说法与实际不符；实现同时接受两种写法：
// 真实 DOM id 由第 3 步精确命中，`-#1` 作为文档兼容别名由第 5 步按 occurrence 解析。
//
// 这里不靠 DOM 查询，而是把文档标题构建成一张**纯数据表**，按固定优先级匹配：
// 原始 slug（忽略大小写）→ 精确 DOM id → slugify 后的宽容匹配 → GitHub 序号 → Milkdown 序号。
//
// 顺序是语义的一部分：
// - **精确 DOM id 必须先于宽容 slug 匹配**：`foo-#2` 会被 slugify 成 `foo-2`，
//   若文档同时存在标题 `Foo 2`，宽容分支会把重复标题的真实 id 抢走（Codex 评审 P2，已复现）；
// - 宽容/原始 slug 必须先于序号解析，否则标题 `Step 1`（slug `step-1`）会被误解析成
//   「`step` 的第 1 个重复」；
// - 第 4/5 步的 base 必须过 `slugify`，否则 `#Hello, World!-1`（GitHub 原形）不命中；
// - 序号必须**严格存在**且 **≥1、无前导零**：只有 2 处 `x` 时 `#x-9` / `#x-0` / `#x-01`
//   全部返回 null（GitHub 与 Milkdown 都不生成这些 id）。

import { decodeURIComponentSafe } from "./link-target";
import { slugify } from "./slug";

export interface HeadingInput {
  /** 标题层级 1-6 */
  level: number;
  /** 标题文本（可见文本） */
  text: string;
  /** Milkdown / ProseMirror 写入的 DOM id（可能带 `-#N` 去重后缀） */
  id?: string;
}

export interface HeadingAnchor {
  /** 在传入数组中的下标（调用方据此映射回节点位置） */
  index: number;
  level: number;
  text: string;
  /** `slugify(text)` */
  baseSlug: string;
  /** DOM id；缺省时退化为 `baseSlug` */
  domId: string;
  /** 同一 `baseSlug` 的第几次出现（0-based） */
  occurrence: number;
}

/**
 * 构建锚点表。
 *
 * - 空标题（`text.trim() === ""`）不进入表，与 `syncHeadingIdPlugin` 的跳过口径一致；
 * - `occurrence` 按 `baseSlug` 全文档计数，**层级变化不重置**（与 GitHub 一致）。
 */
export function buildHeadingAnchors(headings: HeadingInput[]): HeadingAnchor[] {
  const counts = new Map<string, number>();
  const anchors: HeadingAnchor[] = [];

  headings.forEach((heading, index) => {
    const text = heading.text.trim();
    if (!text) return;
    const baseSlug = slugify(text);
    const occurrence = counts.get(baseSlug) ?? 0;
    counts.set(baseSlug, occurrence + 1);
    anchors.push({
      index,
      level: heading.level,
      text,
      baseSlug,
      domId: heading.id || baseSlug,
      occurrence,
    });
  });

  return anchors;
}

/**
 * 按优先级匹配片段。未命中返回 null（调用方必须保持静默）。
 *
 * @param fragment `href` 中 `#` 之后的部分，允许百分号编码
 */
export function matchHeadingAnchor(
  anchors: HeadingAnchor[],
  fragment: string,
): HeadingAnchor | null {
  const raw = decodeURIComponentSafe(fragment).trim();
  if (!raw) return null;
  const low = raw.toLowerCase();

  // 1) 原始 slug（首个 = occurrence 0）
  const exact = anchors.find((anchor) => anchor.baseSlug.toLowerCase() === low);
  if (exact) return exact;

  // 2) 精确 DOM id（含 Milkdown 的 `-#N` 形态）。
  //    必须**先于**宽容 slug 匹配：`foo-#2` 会被 slugify 成 `foo-2`，
  //    若文档里同时存在标题 `Foo 2`，宽容分支会把真实 DOM id 抢走。
  const byDomId = anchors.find((anchor) => anchor.domId.toLowerCase() === low);
  if (byDomId) return byDomId;

  // 3) 宽容匹配：`#Hello, World!` / `#Hello World` 先 slugify 再比
  const slugged = slugify(raw);
  if (slugged) {
    const bySlug = anchors.find((anchor) => anchor.baseSlug === slugged);
    if (bySlug) return bySlug;
  }

  // 4) GitHub 序号后缀：`x-1` = 第 2 处（1-based）。
  //    后缀必须 ≥ 1 且无前导零：GitHub 不生成 `x-0` / `x-01`，
  //    若接受它们，`#x-0` 会错误滚到第 1 处，违背「不存在锚点必须静默」。
  const githubNumbered = /^(.*)-([1-9]\d*)$/.exec(raw);
  if (githubNumbered) {
    const base = slugify(githubNumbered[1]);
    const occurrence = Number(githubNumbered[2]);
    const hit = anchors.find(
      (anchor) => anchor.baseSlug === base && anchor.occurrence === occurrence,
    );
    if (hit) return hit;
  }

  // 5) Milkdown 序号后缀：`x-#N`（N 为 1-based 计数，`-#1` 仅作兼容别名）。
  //    同样拒绝 0 与前导零（上游不生成 `x-#0` / `x-#01`）。
  const milkdownNumbered = /^(.*)-#([1-9]\d*)$/.exec(raw);
  if (milkdownNumbered) {
    const base = slugify(milkdownNumbered[1]);
    const occurrence = Number(milkdownNumbered[2]);
    const hit = anchors.find(
      (anchor) => anchor.baseSlug === base && anchor.occurrence === occurrence,
    );
    if (hit) return hit;
  }

  return null;
}
