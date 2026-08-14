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
 * ProseMirror head 位置 → markdown 字符串偏移（近似）。
 * 策略：doc.textBetween(0, head) 在 markdown 中找子串匹配。
 */
export function prosePosToMarkdownOffset(
  markdown: string,
  textBeforeCursor: string,
): number {
  if (!textBeforeCursor) return 0;
  const idx = markdown.indexOf(textBeforeCursor);
  if (idx >= 0) return idx + textBeforeCursor.length;
  // 全量 textBefore 匹配失败（常见于多块文档：PM textBetween 用单个 \n 连接
  // 块，而 markdown 源码块间是空行 \n\n）。改为用光标所在行的文本片段定位：
  // 从最后一行（光标行）往前找，lastIndexOf 取靠后的命中，更可能落在当前块。
  const lines = textBeforeCursor.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const snippet = lines[i];
    if (!snippet || !snippet.trim()) continue;
    const sIdx = markdown.lastIndexOf(snippet);
    if (sIdx >= 0) return Math.min(sIdx + snippet.length, markdown.length);
  }
  return Math.min(textBeforeCursor.length, markdown.length);
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
