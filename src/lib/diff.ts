// 简易行级 Diff（LCS 算法）
// 用于外部文件变动冲突对话框的差异对比视图。
// 设计取舍：
// - 不引入第三方 diff 库，行级 LCS 足够冲突场景（人看的对比，非 patch）
// - 先修剪公共前缀/后缀，只对差异区域做 LCS，大幅缩小 O(n*m) 矩阵
// - 差异区域超过上限时降级为「整块替换」，避免万行文档卡死主线程

export type DiffOp = "equal" | "add" | "remove";

export interface DiffLine {
  op: DiffOp;
  /** 本地（未保存）行内容 */
  local: string | null;
  /** 磁盘（最新）行内容 */
  disk: string | null;
}

/** 差异区域行数上限，超过则降级为整块替换展示 */
const MAX_LCS_ROWS = 4000;

/**
 * 计算本地内容与磁盘内容的行级差异（unified 风格三态序列）。
 * remove 行 = 本地独有；add 行 = 磁盘独有。
 */
export function diffLines(localText: string, diskText: string): DiffLine[] {
  const local = localText.length ? localText.split("\n") : [];
  const disk = diskText.length ? diskText.split("\n") : [];

  // 修剪公共前缀
  let start = 0;
  while (
    start < local.length &&
    start < disk.length &&
    local[start] === disk[start]
  ) {
    start++;
  }
  // 修剪公共后缀
  let endLocal = local.length;
  let endDisk = disk.length;
  while (
    endLocal > start &&
    endDisk > start &&
    local[endLocal - 1] === disk[endDisk - 1]
  ) {
    endLocal--;
    endDisk--;
  }

  const prefix = local.slice(0, start).map((line) => ({
    op: "equal" as const,
    local: line,
    disk: line,
  }));
  const suffix = local.slice(endLocal).map((line) => ({
    op: "equal" as const,
    local: line,
    disk: line,
  }));
  const midLocal = local.slice(start, endLocal);
  const midDisk = disk.slice(start, endDisk);

  if (midLocal.length === 0 && midDisk.length === 0) {
    return [...prefix, ...suffix];
  }

  // 差异区域过大：降级为整块替换（remove 全部本地 + add 全部磁盘）
  if (midLocal.length + midDisk.length > MAX_LCS_ROWS) {
    return [
      ...prefix,
      ...midLocal.map((line) => ({ op: "remove" as const, local: line, disk: null })),
      ...midDisk.map((line) => ({ op: "add" as const, local: null, disk: line })),
      ...suffix,
    ];
  }

  // 经典 LCS 动态规划：dp[i][j] = midLocal[i:] 与 midDisk[j:] 的最长公共子序列长度
  const n = midLocal.length;
  const m = midDisk.length;
  const dp: Uint32Array[] = Array.from(
    { length: n + 1 },
    () => new Uint32Array(m + 1),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        midLocal[i] === midDisk[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  // 回溯生成三态序列
  const mid: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (midLocal[i] === midDisk[j]) {
      mid.push({ op: "equal", local: midLocal[i], disk: midDisk[j] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      mid.push({ op: "remove", local: midLocal[i], disk: null });
      i++;
    } else {
      mid.push({ op: "add", local: null, disk: midDisk[j] });
      j++;
    }
  }
  while (i < n) {
    mid.push({ op: "remove", local: midLocal[i], disk: null });
    i++;
  }
  while (j < m) {
    mid.push({ op: "add", local: null, disk: midDisk[j] });
    j++;
  }

  return [...prefix, ...mid, ...suffix];
}

/**
 * 生成冲突备份文件路径：`原名.backup.md`，已存在则 `原名.backup.2.md` 递增。
 * 传入同目录已有文件路径集合判断占用（避免生成路径时反复 IO），
 * 大小写不敏感比较（Windows 文件系统），集合条目无需预先归一化。
 */
export function nextBackupPath(
  filePath: string,
  existingPaths: Set<string>,
): string {
  const lower = filePath.toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot > 0 ? filePath.slice(dot) : "";
  const base = ext ? filePath.slice(0, filePath.length - ext.length) : filePath;
  // 归一化既有条目一次，后续候选直接小写查找
  const normalized = new Set(
    Array.from(existingPaths, (p) => p.toLowerCase()),
  );
  const withExt = (n: number) =>
    n === 1 ? `${base}.backup${ext}` : `${base}.backup.${n}${ext}`;
  for (let n = 1; n < 1000; n++) {
    const candidate = withExt(n);
    if (!normalized.has(candidate.toLowerCase())) return candidate;
  }
  return `${base}.backup.${Date.now()}${ext}`;
}
