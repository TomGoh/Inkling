// 源代码模式：ProseMirror ↔ CodeMirror 光标/滚动映射（近似）

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

/** markdown 字符串 offset → ProseMirror doc 内 pos（按块序号近似） */
export function markdownOffsetToProsePos(docSize: number, markdown: string, offset: number): number {
  if (docSize <= 0) return 1;
  const { line } = offsetToLineColumn(markdown, offset);
  const lines = markdown.split("\n");
  const lineCount = Math.max(1, lines.length);
  const ratio = Math.min(line, lineCount - 1) / lineCount;
  const pos = Math.round(ratio * docSize);
  return Math.max(1, Math.min(pos, Math.max(1, docSize - 1)));
}
