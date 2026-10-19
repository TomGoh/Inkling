/**
 * 跨平台路径操作统一工具库（解决 #115）
 * 规范化处理 POSIX (/) 与 Windows (\) 分隔符
 */

/**
 * 统一路径分隔符为 POSIX 风格 (/)，移除末尾多余分隔符（除根目录外）
 */
export function normalizePath(path: string): string {
  if (!path) return "";
  let normalized = path.replace(/\\/g, "/");
  // 匹配形如 c:/ 或 c: 的 Windows 盘符并将其转为大写 C:/
  if (/^[a-zA-Z]:/.test(normalized)) {
    normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }
  // 保持单斜杠根目录或盘符根目录 (如 C:/)
  if (normalized === "/" || /^[a-zA-Z]:\/$/.test(normalized)) {
    return normalized;
  }
  return normalized.replace(/\/+$/, "");
}

/**
 * 绝对路径：Windows 盘符（`C:\` / `C:/`）、UNC（`\\srv\share`）、POSIX 根（`/…`）。
 *
 * 注意 `c:notes`（盘符相对）**不是**绝对路径——判定要求盘符后紧跟分隔符。
 * 本函数是**判定**的单一实现（#298）：`theme/typora/path.ts` 从这里 re-export，
 * `components/Editor/image-upload.ts` / `remote-image.ts` 也统一从这里取，
 * 不允许再出现第二份。
 */
export function isAbsolutePath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  return /^[a-zA-Z]:\//.test(normalized) || normalized.startsWith("//") || normalized.startsWith("/");
}

/**
 * 是否为无法落盘的虚拟路径（未保存草稿）。
 * 草稿 tab 的 path 形如 "untitled-N"（见 store/workspace/tabs.ts newTab），并非空字符串，
 * 仅判空会漏掉草稿场景，导致相对路径按 CWD 解析出错误目标。
 *
 * 单一实现（#298）：原在 `components/Editor/image-upload.ts`，现集中于此，
 * `image-upload.ts` / `remote-image.ts` / 链接分类器共用。
 */
export function isUntitledPath(documentPath: string): boolean {
  const p = documentPath.trim();
  return !p || p.startsWith("untitled-");
}

/** 分隔符跟随基准路径：含反斜杠即按 Windows 风格产出。 */
function separatorOf(path: string): "\\" | "/" {
  return path.includes("\\") ? "\\" : "/";
}

/**
 * 折叠 `.` / `..`，保留盘符根（`C:/`）与 UNC 双前导斜杠（`//srv`），最后按 `sep` 还原分隔符。
 *
 * 与 `normalizePath` 的分工：`normalizePath` 只统一分隔符与盘符大小写、**不折叠 `..`**
 * （文件树展示等场景依赖这一语义）；`resolvePath` 需要真正的语义归算，故在此单独折叠。
 */
function foldSegments(raw: string, sep: "\\" | "/"): string {
  const n = raw.replace(/\\/g, "/");
  const drive = /^([a-zA-Z]:)(\/|$)/.exec(n);
  // UNC：`//srv/share/...`（`//` 之后必须是主机名）
  const unc = !drive && /^\/\/[^/]/.test(n);
  const prefix = drive ? drive[1] : unc ? "//" : "";
  const rest = drive ? n.slice(drive[1].length) : unc ? n.slice(2) : n;
  const absolute = Boolean(drive) || unc || rest.startsWith("/");
  const out: string[] = [];
  for (const seg of rest.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length > 0 && out[out.length - 1] !== "..") out.pop();
      else if (!absolute) out.push("..");
      continue;
    }
    out.push(seg);
  }
  const joined = out.join("/");
  const head = drive ? `${prefix}/` : unc ? prefix : absolute ? "/" : "";
  const result = head + joined || "/";
  return sep === "\\" ? result.replace(/\//g, "\\") : result;
}

/**
 * 以 `baseDir` 为基准解析 `target`（纯函数，链接分类器专用，#298）。
 *
 * - 绝对目标（`C:\…` / `C:/…` / `/…` / UNC）→ 直接折叠归一，基准目录不参与；
 * - 相对目标 → 拼到 `baseDir` 后折叠 `.` / `..`，分隔符**跟随 `baseDir`**；
 * - `baseDir` 为空时按相对路径折叠（保留前导 `..`），避免凭空造出根路径。
 *
 * 与 `theme/typora/path.resolvePath` 的关系：那套与 theme 自己的 `normalizePath` 绑定、
 * 服务于主题资源重写；两套**不得互相替换**（见设计文档边界 6）。
 */
export function resolvePath(baseDir: string, target: string): string {
  if (isAbsolutePath(target)) return foldSegments(target, separatorOf(target));
  const sep = separatorOf(baseDir);
  if (!baseDir) return foldSegments(target, sep);
  const base = baseDir.replace(/[\\/]+$/, "");
  return foldSegments(`${base}/${target}`, sep);
}

/**
 * 获取路径的文件名或最后一级目录名
 */
export function baseName(path: string): string {
  if (!path) return "";
  const normalized = normalizePath(path);
  const idx = normalized.lastIndexOf("/");
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

/**
 * 获取路径的父目录
 * - Windows 盘符根 (如 C:\ 或 C:/) 返回原盘符根 C:\ 或 C:/
 * - POSIX 根 (/) 返回 /
 * - 相对单级路径或无分隔符时返回原路径
 */
export function parentDir(filePath: string): string {
  if (!filePath) return "";
  const idx = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  if (idx < 0) return filePath;
  const sep = filePath[idx];
  if (idx === 0) return sep; // '/' 或 '\'
  // Windows 盘符根：如 C:\file.md -> C:\，C:/file.md -> C:/
  if (idx === 2 && /^[a-zA-Z]:[\\/]/.test(filePath)) {
    return filePath.slice(0, 2) + sep;
  }
  return filePath.slice(0, idx);
}

/**
 * 别名，与 dirNameOf 兼容统一
 */
export const dirNameOf = parentDir;

/**
 * 连接多个路径片段，自动根据第一个片段风格或使用 '/' 拼接
 */
export function joinPath(base: string, ...parts: string[]): string {
  if (!base) return parts.filter(Boolean).join("/");
  const isWinSep = base.includes("\\") && !base.includes("/");
  const sep = isWinSep ? "\\" : "/";
  if (parts.length === 1 && parts[0] === "") {
    const left = base.replace(/[\\/]+$/, "");
    return left + sep;
  }
  let result = base.replace(/[\\/]+$/, "");
  for (const part of parts) {
    if (!part) continue;
    const clean = part.replace(/^[\\/]+/, "").replace(/[\\/]+$/, "");
    if (clean) {
      result += sep + clean;
    }
  }
  return result;
}

/**
 * 路径是否按 Windows 语义比较（盘符 / UNC / 含反斜杠）。
 *
 * 判定口径与 `theme/typora/path.ts` 的 `isWithinRoot` 一致：**按路径形态**决定是否折叠大小写，
 * 不依赖运行平台——同一输入在任何平台上结论一致（#296）。
 */
function usesWindowsSemantics(path: string): boolean {
  return /^[a-zA-Z]:/.test(path) || path.startsWith("\\\\") || path.includes("\\");
}

/** normalizePath + 按需折叠大小写（Windows 语义不敏感，POSIX 敏感） */
function canonicalPath(path: string, foldCase: boolean): string {
  const normalized = normalizePath(path);
  return foldCase ? normalized.toLowerCase() : normalized;
}

/**
 * 判断 targetPath 是否在 parentPath 目录下（或两者相等）。
 *
 * 大小写口径按路径形态判定：`C:\Work\Notes` 与 `c:\work\notes\x.md` 视为同一棵树；
 * 纯 POSIX 路径保持大小写敏感（`/a/B` ≠ `/a/b`）。
 */
export function isPathWithin(targetPath: string, parentPath: string): boolean {
  if (!parentPath || !targetPath) return false;
  const foldCase = usesWindowsSemantics(targetPath) || usesWindowsSemantics(parentPath);
  const target = canonicalPath(targetPath, foldCase);
  const parent = canonicalPath(parentPath, foldCase);
  if (target === parent) return true;
  const prefix = parent.endsWith("/") ? parent : parent + "/";
  return target.startsWith(prefix);
}

/**
 * 查表用的规范键：`normalizePath` + Windows 语义折叠大小写。
 *
 * 用于 `pending-anchor` 这类「先登记、后消费」的映射表：两侧路径可能一个来自链接解析、
 * 一个来自已打开 tab，Windows 上仅大小写不同也必须命中同一条记录。
 */
export function pathKey(path: string): string {
  if (!path) return "";
  return canonicalPath(path, usesWindowsSemantics(path));
}

/**
 * 两个路径是否指向同一文件/目录（#296 自链接判定）。
 *
 * 与 `isPathWithin` 同一套大小写口径：Windows 语义折叠、POSIX 敏感；分隔符差异不影响结果。
 * 空路径一律返回 false（草稿的 `untitled-N` 不会与任何真实文件相同）。
 */
export function isSamePath(a: string, b: string): boolean {
  if (!a || !b) return false;
  const foldCase = usesWindowsSemantics(a) || usesWindowsSemantics(b);
  return canonicalPath(a, foldCase) === canonicalPath(b, foldCase);
}

/**
 * 把目录重命名前缀同步到子路径
 */
export function rebasePathPrefix(path: string, from: string, to: string): string {
  return isPathWithin(path, from) ? to + path.slice(from.length) : path;
}

/**
 * 取 targetPath 相对 root 的 POSIX 风格路径
 *
 * - 不在 root 下（或未提供 root）时退化为文件名，保证展示层永远有可用的短路径；
 * - 统一走 normalizePath，因此两侧的分隔符差异与末尾斜杠都不会影响判定。
 */
export function relativeToRoot(targetPath: string, root: string | null): string {
  if (!targetPath) return "";
  if (!root) return baseName(targetPath);
  const normRoot = normalizePath(root);
  const normTarget = normalizePath(targetPath);
  const prefix = normRoot.endsWith("/") ? normRoot : normRoot + "/";
  if (normTarget.startsWith(prefix)) {
    return normTarget.slice(prefix.length);
  }
  return baseName(targetPath);
}

/** `path` 是否等于 `parent` 或位于其下（两侧都已 normalize） */
function isSameOrUnder(path: string, parent: string): boolean {
  if (path === parent) return true;
  const prefix = parent.endsWith("/") ? parent : parent + "/";
  return path.startsWith(prefix);
}

/**
 * 求一组文件路径的共同父目录
 *
 * 用途：候选来自不同目录、又没有统一 root 时（例如 Quick Open 的单文件模式，
 * 那里 `rootPath` 只是其中某个文件的父目录），需要一个能区分全部候选的展示基准。
 * 直接退化成 basename 会让 `/a/report.md` 与 `/b/report.md` 无法区分（#228）。
 *
 * 返回 null 表示**没有可用的共同父目录**（空列表、或分属不同盘符 / 根），
 * 调用方应退回完整路径而不是 basename。
 */
export function commonParentDir(paths: string[]): string | null {
  if (paths.length === 0) return null;
  const dirs: string[] = [];
  for (const path of paths) {
    const dir = normalizePath(parentDir(path));
    // 空路径：无从判断，交由调用方退回完整路径
    if (!dir) return null;
    dirs.push(dir);
  }
  let common = dirs[0];
  for (const dir of dirs) {
    while (!isSameOrUnder(dir, common)) {
      const up = normalizePath(parentDir(common));
      // 已经到根仍不包含 → 分属不同根，无共同父目录
      if (up === common) return null;
      common = up;
    }
  }
  return common;
}
