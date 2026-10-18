// 链接目标分类器（#298 骨架，一次写完整 5 类）
//
// 职责只有一件：把 `href` + 上下文（当前文档路径 / 工作区根）映射成一个**纯数据**分类结果。
// 不做 DOM、不做 IPC、不做存在性检查（存在性由打开动作的失败结果承担），因此可以表驱动单测，
// 也便于在改动判定顺序时用变异验证暴露问题。
//
// 判定顺序是语义的一部分，**不可交换**：
//   1. 空 → empty
//   2. `#frag` → anchor
//   3. **绝对路径先于 scheme**：`C:\ws\x.md` 会被 /^[a-z][a-z0-9+.-]*:/ 匹配成 scheme "c:"，
//      若先判 scheme 就会把 Windows 路径误判成 blocked-scheme，绝对路径与相对路径的
//      「同等对待」当场失效。
//   4. 有 scheme → external / local-file / blocked-scheme
//   5. 文件分支：绝对路径不依赖 documentPath（草稿里也能开）；相对路径依赖基准目录；
//      再做工作区包含性与扩展名收敛。

import { isAbsolutePath, isPathWithin, isUntitledPath, parentDir, resolvePath } from "./path-utils";

/** 不支持的原因（每一种都有固定文案，见 components/Editor/link-actions.ts）。 */
export type UnsupportedReason =
  | "local-file"
  | "blocked-scheme"
  | "outside-workspace"
  | "not-markdown"
  /** 未保存草稿里的「相对」链接：没有基准目录可解析 */
  | "no-workspace"
  /** 「绝对」链接但 workspaceRoot 不可用：无法校验是否在工作区内 */
  | "no-workspace-root";

export type LinkClassification =
  | { kind: "empty" }
  | { kind: "anchor"; fragment: string }
  | { kind: "external"; url: string }
  /** `path` 已归一为绝对路径；`fragment` 保留原始形态，由打开后的锚点匹配端解码 */
  | { kind: "workspace-file"; path: string; fragment: string }
  | { kind: "unsupported"; reason: UnsupportedReason; raw: string };

export interface LinkContext {
  /** 编辑器实例的 filePath；未保存草稿这里是虚拟路径（untitled-N） */
  documentPath: string;
  /** 工作区根（store 的 rootPath）；单文件模式下等于文档父目录；未打开工作区为 null */
  workspaceRoot: string | null;
}

/** 外部链接协议（区分大小写不敏感，由调用方统一小写化）。 */
const EXTERNAL_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

/**
 * `decodeURIComponent` 的安全版本：非法编码（如 `%E7%90`）原样返回，绝不抛异常。
 * 链接文本来自用户文档，不能让一个坏 `%` 把点击处理打断。
 */
export function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Markdown 文件扩展名（大小写不敏感）。 */
const MARKDOWN_EXT_RE = /\.(md|markdown)$/i;

/**
 * 分类链接目标。
 *
 * 纯函数：相同输入必得相同输出，不读取任何全局状态。
 */
export function classifyLink(href: string, ctx: LinkContext): LinkClassification {
  const raw = href.trim();
  if (!raw) return { kind: "empty" };

  // 片段只在第一个 `#` 处切分：URL 的 fragment 本身可以再含 `#`
  const hashIndex = raw.indexOf("#");
  const pathPart = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const fragment = hashIndex >= 0 ? raw.slice(hashIndex + 1) : "";

  // 纯锚点（含 `href="#"` → fragment ""，匹配端会返回 null，天然无动作）
  if (!pathPart) return { kind: "anchor", fragment };

  const decoded = decodeURIComponentSafe(pathPart);

  // 绝对路径判定必须在 scheme 判定之前（见文件头注释）
  if (!isAbsolutePath(decoded)) {
    const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(decoded);
    if (schemeMatch) {
      const scheme = schemeMatch[1].toLowerCase();
      if (EXTERNAL_SCHEMES.has(scheme)) {
        // 外链保留原始 href（含 fragment、原始百分号编码），交给系统浏览器处理
        return { kind: "external", url: raw };
      }
      if (scheme === "file") {
        return { kind: "unsupported", reason: "local-file", raw };
      }
      // javascript: / data: / tauri: / asset: / ftp: / 单字母 scheme（a:b）一律不放行执行
      return { kind: "unsupported", reason: "blocked-scheme", raw };
    }
  }

  const absolute = isAbsolutePath(decoded);
  let absPath: string;
  if (absolute) {
    // 绝对路径不依赖 documentPath：未保存草稿里点 `C:\ws\a.md` 必须仍然放行
    if (ctx.workspaceRoot === null) {
      return { kind: "unsupported", reason: "no-workspace-root", raw };
    }
    absPath = resolvePath("", decoded);
  } else {
    if (isUntitledPath(ctx.documentPath)) {
      return { kind: "unsupported", reason: "no-workspace", raw };
    }
    absPath = resolvePath(parentDir(ctx.documentPath), decoded);
  }

  // 单文件模式下 rootPath 就是文档父目录；未打开工作区时退化为父目录，绝不退化成「无限制」
  const root = ctx.workspaceRoot ?? parentDir(ctx.documentPath);
  if (!isPathWithin(absPath, root)) {
    return { kind: "unsupported", reason: "outside-workspace", raw };
  }
  if (!MARKDOWN_EXT_RE.test(absPath)) {
    return { kind: "unsupported", reason: "not-markdown", raw };
  }

  return { kind: "workspace-file", path: absPath, fragment };
}
