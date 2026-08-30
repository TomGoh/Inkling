// 源代码模式：ProseMirror ↔ CodeMirror 光标/滚动映射
// 注意：这是「近似」映射（issue #19 已接受）。PM doc 与 markdown 源码并非
// 一一对应（标题的 #、围栏代码块、列表标记等在 PM 里不保留），因此不追求
// 精确到字符，只保证：光标落在合理区块、越界有确定性兜底、长文档滚动比例保留。
//
// 块级增强（issue #26）：
// - markdownOffsetToProsePos 按「源行权重」估算 PM 位置：围栏代码块内部行权重
//   极小、空行权重为 0、常规内容行权重为 1，避免代码块/空行把线性比例拉偏。
// - prosePosToMarkdownOffset 增加「当前行片段匹配」：全量 textBefore 匹配失败时，
//   用光标所在行的文本片段从后往前定位，避免多块文档因分隔符差异丢失定位。

/** 把字符串偏移转为 { line, column }，line/column 均 0-based */
export function offsetToLineColumn(
  text: string,
  offset: number,
): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(offset, text.length));
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < clamped; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: clamped - lineStart };
}

/** line/column (0-based) → 字符串偏移 */
export function lineColumnToOffset(text: string, line: number, column: number): number {
  const lines = text.split("\n");
  const safeLine = Math.max(0, Math.min(line, Math.max(0, lines.length - 1)));
  let offset = 0;
  for (let i = 0; i < safeLine; i++) {
    offset += lines[i].length + 1;
  }
  offset += Math.max(0, Math.min(column, lines[safeLine]?.length ?? 0));
  return Math.min(offset, text.length);
}

/**
 * 剥掉行内标记（图片/链接/行内代码/加粗/删除线/斜体），得到与
 * PM textBetween 一致的纯文本形态。不剥标记时 `**Problem**`、`` `code` ``
 * 等行永远命不中 PM 纯文本，匹配会跳过正确锚点落到错误位置（#136 实测）。
 */
export function stripInlineMarkup(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/(^|[^\w*])\*([^*\s][^*]*)\*(?=[^\w*]|$)/g, "$1$2")
    .replace(/(^|[^\w_])_([^_\s][^_]*)_(?=[^\w_]|$)/g, "$1$2");
}

/** 归一化行条目：纯文本 + 它在原 markdown 中的行首偏移 */
export interface MarkdownNormLine {
  text: string;
  offset: number;
}

/**
 * 单行 markdown → 它在 PM 纯文本中的形态（剥块级语法与行内标记）。
 * 非围栏上下文下：围栏标记行/空行/分割线返回空数组（PM 中无对应文本）；
 * 表格行按单元格拆成多条（PM 表格每个单元格段落各占一行）；
 * 其余普通行返回剥前缀后的正文（≤1 条）。
 * 供 resolveAnchorProsePos 的候选行匹配与 markdownNormLines 复用，避免双实现漂移。
 */
export function markdownNormLine(trimmed: string): string[] {
  if (!trimmed) return [];
  if (/^(`{3,}|~{3,})/.test(trimmed)) return [];
  if (/^(?:\*{3,}|-{3,}|_{3,})$/.test(trimmed)) return [];
  if (trimmed.startsWith("|")) {
    if (/^\|[\s:|-]+\|?$/.test(trimmed)) return [];
    const cells = trimmed.replace(/^\|/, "").replace(/\|$/, "").split("|");
    const out: string[] = [];
    for (const cell of cells) {
      const t = stripInlineMarkup(cell.trim());
      if (t) out.push(t.trimEnd());
    }
    return out;
  }
  let body = trimmed.replace(/^(?:>\s?)+/, "");
  if (/^#{1,6}\s/.test(body)) {
    // 标题只剥 # 前缀：编号标题「## 6. 章节」的「6. 」是标题文本的一部分，
    // 若再走列表标记剥离会把它切掉，导致与 PM 标题文本失配（#136）
    body = body.replace(/^#{1,6}\s+/, "");
  } else {
    body = body
      .replace(/^(?:[-*+]|\d+[.)])\s+/, "")
      .replace(/^\[[ xX]\]\s*/, "");
  }
  body = stripInlineMarkup(body).trim();
  return body ? [body] : [];
}

/**
 * 把 markdown 归一化为「PM 纯文本」形态的行条目，供跨格式匹配（#136）：
 * - 剥标题/引用/列表前缀与行内标记；
 * - 表格行按单元格拆成多行（PM 表格每个单元格段落各占一行）；
 * - 分割线与围栏标记跳过（PM 中无对应文本），围栏内代码行保留原样。
 */
export function markdownNormLines(markdown: string): MarkdownNormLine[] {
  const out: MarkdownNormLine[] = [];
  const lines = markdown.split("\n");
  let offset = 0;
  let fence: { char: string; len: number } | null = null;
  for (const raw of lines) {
    const lineOffset = offset;
    offset += raw.length + 1;
    const trimmed = raw.trim();
    if (fence) {
      if (trimmed.startsWith(fence.char.repeat(fence.len))) {
        fence = null;
      } else if (trimmed) {
        out.push({ text: trimmed, offset: lineOffset });
      }
      continue;
    }
    const fi = fenceInfo(raw);
    if (fi) {
      fence = fi;
      continue;
    }
    for (const text of markdownNormLine(trimmed)) {
      out.push({ text, offset: lineOffset });
    }
  }
  return out;
}

/** PM 行与归一化 md 行的模糊匹配：相等 / 包含（短侧 ≥6 字）/ 公共前缀占比高（视口截断场景） */
function pmMdLinesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length >= 6 && longer.includes(shorter)) return true;
  const minLen = Math.min(a.length, b.length);
  if (minLen >= 4) {
    let common = 0;
    while (common < minLen && a.charCodeAt(common) === b.charCodeAt(common)) {
      common++;
    }
    if (common >= 4 && common / minLen >= 0.5) return true;
  }
  return false;
}

/**
 * 尾窗口序列匹配（进入方向主策略，#136）：
 * textBefore 的末行即视口顶部内容，前若干行是它的上下文。先在归一化
 * md 行里找末行的全部候选，再用上下文向前逐一验证打分——短重复单元格
 * （「低」「中」）单行歧义会被上下文唯一化；得分相同取更接近比例估计处。
 * 返回候选行首偏移；无候选返回 -1。
 */
function matchPmTailToMarkdown(
  markdown: string,
  textBeforeCursor: string,
  posRatio?: number,
): number {
  const mdLines = markdownNormLines(markdown);
  if (mdLines.length === 0) return -1;
  const pmLines: string[] = [];
  for (const l of textBeforeCursor.split("\n")) {
    const t = l.trim();
    if (t) pmLines.push(t);
  }
  if (pmLines.length === 0) return -1;
  const tail = pmLines[pmLines.length - 1];
  const CONTEXT = 6;
  const context = pmLines.slice(
    Math.max(0, pmLines.length - 1 - CONTEXT),
    pmLines.length - 1,
  );

  const candidates: number[] = [];
  for (let i = 0; i < mdLines.length && candidates.length < 128; i++) {
    if (pmMdLinesMatch(tail, mdLines[i].text)) candidates.push(i);
  }
  if (candidates.length === 0) return -1;

  const estOffset =
    posRatio != null && posRatio >= 0 && posRatio <= 1
      ? posRatio * markdown.length
      : -1;

  let bestIdx = -1;
  let bestScore = -1;
  let bestDist = Infinity;
  for (const ci of candidates) {
    // 与末行完全相等的候选 +4 优先：模糊匹配会让近似行（如
    // compute(2,59) 与 compute(22,59)）靠上下文堆出同分，完全相等
    // 的候选才是视口顶部内容本身（#136）
    let score = mdLines[ci].text === tail ? 4 : 0;
    let mi = ci - 1;
    for (let k = context.length - 1; k >= 0 && mi >= 0; k--) {
      let found = -1;
      for (let probe = mi; probe >= 0 && probe >= mi - 3; probe--) {
        if (pmMdLinesMatch(context[k], mdLines[probe].text)) {
          found = probe;
          break;
        }
      }
      if (found < 0) break;
      score += found === mi ? 2 : 1;
      mi = found - 1;
    }
    const dist =
      estOffset >= 0 ? Math.abs(mdLines[ci].offset - estOffset) : 0;
    if (score > bestScore || (score === bestScore && dist < bestDist)) {
      bestScore = score;
      bestDist = dist;
      bestIdx = ci;
    }
  }
  if (bestIdx < 0) return -1;
  return Math.min(mdLines[bestIdx].offset, Math.max(0, markdown.length - 1));
}

/**
 * ProseMirror head 位置 → markdown 字符串偏移（近似）。
 * 管线：全量子串命中 → 归一化尾窗口序列匹配（表格/标记密集文档主策略）
 * → 旧两步行匹配兜底。返回的偏移落在目标「行首」——消费方
 * （CM lineBlockAt / 锚点滚动）均按行粒度工作，行首即足够。
 */
export function prosePosToMarkdownOffset(
  markdown: string,
  textBeforeCursor: string,
  posRatio?: number,
): number {
  if (!textBeforeCursor) return 0;
  const idx = markdown.indexOf(textBeforeCursor);
  if (idx >= 0) return idx + textBeforeCursor.length;

  const matched = matchPmTailToMarkdown(markdown, textBeforeCursor, posRatio);
  if (matched >= 0) return matched;

  return legacyProseLineMatch(markdown, textBeforeCursor);
}

/** 旧两步行匹配（兜底）：找最后一条 lastIndexOf 命中的完整行作基准，再向后顺序续匹配 */
function legacyProseLineMatch(
  markdown: string,
  textBeforeCursor: string,
): number {
  // 全量 textBefore 匹配失败（常见于多块文档：PM textBetween 用单个 \n 连接
  // 块，而 markdown 源码块间是空行 \n\n）。按行定位，注意末行常被截断
  // （锚点落在行中间）：短截断片段直接 lastIndexOf 会命中文档后部的重复
  // 文本（#136 实测：4 字前缀命中末节）。改为两步：先找最后一条全长命中
  // 的完整行作基准，再从基准行末尾向后顺序续匹配剩余行（含截断末行），
  // 把锚点收敛到同一区块。
  const lines = textBeforeCursor.split("\n");
  const tailIdx = lines.length - 1;
  let baseLineIdx = -1;
  let cursor = -1;
  for (let i = tailIdx - 1; i >= 0; i--) {
    const snippet = lines[i];
    if (!snippet || !snippet.trim()) continue;
    const sIdx = markdown.lastIndexOf(snippet);
    if (sIdx >= 0) {
      baseLineIdx = i;
      cursor = sIdx + snippet.length;
      break;
    }
  }
  if (baseLineIdx < 0) {
    // 无完整基准行（如文档首段即被截断）：退回对末行 lastIndexOf
    const snippet = lines[tailIdx];
    if (snippet && snippet.trim()) {
      const sIdx = markdown.lastIndexOf(snippet);
      if (sIdx >= 0) return Math.min(sIdx + snippet.length, markdown.length);
    }
    return Math.min(textBeforeCursor.length, markdown.length);
  }
  for (let i = baseLineIdx + 1; i < lines.length; i++) {
    const snippet = lines[i];
    if (!snippet || !snippet.trim()) continue;
    const next = markdown.indexOf(snippet, cursor);
    if (next >= 0) cursor = next + snippet.length;
    else break;
  }
  return Math.min(cursor, markdown.length);
}

/** 滚动位置：按 scrollHeight 比例映射 */
export function mapScrollTop(
  fromScrollTop: number,
  fromScrollHeight: number,
  toScrollHeight: number,
): number {
  if (fromScrollHeight <= 0 || toScrollHeight <= 0) return 0;
  const ratio = fromScrollTop / fromScrollHeight;
  return Math.round(ratio * toScrollHeight);
}

/** 解析一行是否围栏代码块标记，返回围栏字符与长度；非围栏返回 null */
function fenceInfo(line: string): { char: string; len: number } | null {
  const m = /^\s*(`{3,}|~{3,})/.exec(line);
  if (!m) return null;
  return { char: m[1][0], len: m[1].length };
}

/**
 * 计算 markdown 每行的「PM 权重」：
 * - 围栏代码块内部行权重极小（0.02），整个代码块在 PM 里只是一个 code_block 节点
 * - 空行权重 0
 * - 其余（标题/段落/列表等）每行权重 1
 */
export function computeLineWeights(markdown: string): number[] {
  const lines = markdown.split("\n");
  const weights: number[] = [];
  let fence: { char: string; len: number } | null = null;
  for (const line of lines) {
    if (fence) {
      // 围栏内：检查闭合围栏（长度 ≥ 开启围栏）
      const trimmed = line.trim();
      if (trimmed.startsWith(fence.char.repeat(fence.len))) {
        fence = null;
        weights.push(1); // 闭合围栏行
      } else {
        weights.push(0.02); // 代码内容行
      }
      continue;
    }
    const info = fenceInfo(line);
    if (info) {
      fence = info;
      weights.push(1); // 开启围栏行
      continue;
    }
    weights.push(line.trim() === "" ? 0 : 1);
  }
  return weights;
}

/**
 * markdown 字符串 offset → ProseMirror doc 内 pos（按块级权重近似）。
 * 用「光标之前已完成行的权重和 + 当前行内比例」占全文权重和的比例映射到 docSize，
 * 对围栏代码块/空行做了折权，比旧的纯行数线性比例更贴合 PM 的块结构。
 * 越界/空文档有确定性兜底：起点→1、终点→docSize-1、空文档→1。
 */
export function markdownOffsetToProsePos(
  docSize: number,
  markdown: string,
  offset: number,
): number {
  if (docSize <= 0) return 1;
  if (offset <= 0) return 1;
  if (offset >= markdown.length) return docSize - 1;
  const { line, column } = offsetToLineColumn(markdown, offset);
  const weights = computeLineWeights(markdown);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return 1;
  let before = 0;
  for (let i = 0; i < line; i++) before += weights[i] ?? 0;
  const lineLen = markdown.split("\n")[line]?.length ?? 0;
  const curWeight = weights[line] ?? 0;
  const frac =
    curWeight > 0 && lineLen > 0 ? Math.min(1, column / lineLen) : 0;
  const ratio = Math.max(0, Math.min(1, (before + curWeight * frac) / total));
  const pos = Math.round(ratio * docSize);
  return Math.max(1, Math.min(pos, Math.max(1, docSize - 1)));
}
