// 文件系统封装层
// 桌面端走 Tauri command（Rust 端实现），浏览器端用 mock 数据走通 UI
// 这样保证沙箱内可开发验证，真实环境走原生 fs

import { invoke, isTauri, convertFileSrc } from "@tauri-apps/api/core";

/** 文件树节点（与 Rust 端 FileNode 对应） */
export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children: FileNode[];
}

/** mock 文件树（浏览器开发用） */
const MOCK_TREE: FileNode = {
  name: "mock-workspace",
  path: "/mock-workspace",
  is_dir: true,
  children: [
    {
      name: "notes",
      path: "/mock-workspace/notes",
      is_dir: true,
      children: [
        {
          name: "readme.md",
          path: "/mock-workspace/notes/readme.md",
          is_dir: false,
          children: [],
        },
        {
          name: "todo.md",
          path: "/mock-workspace/notes/todo.md",
          is_dir: false,
          children: [],
        },
      ],
    },
    {
      name: "intro.md",
      path: "/mock-workspace/intro.md",
      is_dir: false,
      children: [],
    },
  ],
};

const MOCK_FILE_CONTENT: Record<string, string> = {
  "/mock-workspace/notes/readme.md":
    "# Readme\n\n这是浏览器 mock 环境的示例文件。\n\n- 桌面端会调用真实文件系统\n- 浏览器端用此 mock 验证 UI\n",
  "/mock-workspace/notes/todo.md":
    "# Todo\n\n- [x] 任务1\n- [ ] 任务2\n- [ ] 任务3\n",
  "/mock-workspace/intro.md":
    "# Inkling 简介\n\n一个所见即所得的 Markdown 编辑器。\n",
};

/** 递归列出目录树 */
export async function listDir(
  dirPath: string,
  maxDepth?: number,
): Promise<FileNode> {
  if (isTauri()) {
    return invoke<FileNode>("list_dir", {
      dirPath,
      maxDepth: maxDepth ?? 10,
    });
  }
  // 浏览器 mock
  await new Promise((r) => setTimeout(r, 100));
  return structuredClone(MOCK_TREE);
}

/** 读取文本文件 */
export async function readTextFile(filePath: string): Promise<string> {
  if (isTauri()) {
    return invoke<string>("read_text_file", { filePath });
  }
  await new Promise((r) => setTimeout(r, 50));
  return MOCK_FILE_CONTENT[filePath] ?? "";
}

/** 写入文本文件 */
export async function writeTextFile(
  filePath: string,
  content: string,
): Promise<void> {
  if (isTauri()) {
    return invoke<void>("write_text_file", { filePath, content });
  }
  // 浏览器 mock：只在内存里记录
  MOCK_FILE_CONTENT[filePath] = content;
}

/** 读取文件最后修改时间（Unix 秒）。浏览器 mock 返回当前时间，不参与监听 */
export async function fileMtime(filePath: string): Promise<number> {
  if (isTauri()) {
    return invoke<number>("file_mtime", { filePath });
  }
  return Date.now() / 1000;
}

/** 重命名/移动文件或目录 */
export async function renamePath(from: string, to: string): Promise<void> {
  if (isTauri()) {
    return invoke<void>("rename_path", { from, to });
  }
  // 浏览器 mock：更新内存中的内容键
  if (MOCK_FILE_CONTENT[from] !== undefined) {
    MOCK_FILE_CONTENT[to] = MOCK_FILE_CONTENT[from];
    delete MOCK_FILE_CONTENT[from];
  }
}

/** 删除文件或目录（目录递归）。浏览器 mock 仅清内容表 */
export async function deletePath(path: string): Promise<void> {
  if (isTauri()) {
    return invoke<void>("delete_path", { path });
  }
  for (const k of Object.keys(MOCK_FILE_CONTENT)) {
    if (k === path || k.startsWith(path + "/")) delete MOCK_FILE_CONTENT[k];
  }
}

/** 创建空文件 */
export async function createFile(filePath: string): Promise<void> {
  if (isTauri()) {
    return invoke<void>("create_file", { filePath });
  }
  MOCK_FILE_CONTENT[filePath] = "";
}

/** 创建目录 */
export async function createDir(dirPath: string): Promise<void> {
  if (isTauri()) {
    return invoke<void>("create_dir", { dirPath });
  }
  // 浏览器 mock 无操作
}

/** 全局搜索命中项 */
export interface SearchHit {
  path: string;
  line: number;
  column: number;
  preview: string;
}

/** 在工作区所有 .md 文件中搜索文本内容 */
export async function searchInWorkspace(
  root: string,
  query: string,
  caseSensitive: boolean,
  useRegex: boolean,
): Promise<SearchHit[]> {
  if (isTauri()) {
    return invoke<SearchHit[]>("search_in_workspace", {
      root,
      query,
      caseSensitive,
      useRegex,
    });
  }
  // 浏览器 mock：扫描内存中的 mock 文件
  const hits: SearchHit[] = [];
  const q = useRegex ? query : query;
  let re: RegExp;
  try {
    const pattern = useRegex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    re = new RegExp(pattern, caseSensitive ? "g" : "gi");
  } catch {
    return hits;
  }
  for (const [path, content] of Object.entries(MOCK_FILE_CONTENT)) {
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      re.lastIndex = 0;
      if (re.test(lines[i])) {
        hits.push({ path, line: i + 1, column: 1, preview: lines[i] });
      }
    }
  }
  return hits;
}

/**
 * 写入二进制文件（图片等）。
 * 桌面端走 Rust 命令；浏览器端无真实 fs，仅返回成功（mock 无法持久化二进制）。
 * @param data 字节数组
 */
export async function writeBinaryFile(
  filePath: string,
  data: Uint8Array,
): Promise<void> {
  if (isTauri()) {
    // Tauri 序列化 Vec<u8> 需要普通数组
    return invoke<void>("write_binary_file", {
      filePath,
      data: Array.from(data),
    });
  }
  // 浏览器 mock：无操作
}

/** 路径分隔符拼接（兼容 Windows / Unix） */
export function joinPath(base: string, rel: string): string {
  const sep = base.includes("\\") && !base.includes("/") ? "\\" : "/";
  const left = base.replace(/[\\/]+$/, "");
  const right = rel.replace(/^[\\/]+/, "");
  return left + sep + right;
}

/**
 * 把 markdown 中的图片 src 解析为 WebView 可加载的 URL。
 * - http(s)/data/blob/asset 协议：原样返回
 * - 绝对路径：convertFileSrc 转换
 * - 相对路径：相对工作区根目录拼接后 convertFileSrc 转换
 * - 浏览器环境：原样返回（无法访问本地文件）
 */
export function resolveImageSrc(src: string, rootPath: string | null): string {
  if (!src) return src;
  if (!isTauri()) return src;
  // 协议 URL 直接放行
  if (/^(https?:|data:|blob:|asset:|tauri:)/i.test(src)) return src;
  // Windows 绝对路径（如 C:\）或 Unix 绝对路径（/）
  const isAbsolute = /^[a-zA-Z]:[\\/]/.test(src) || src.startsWith("/");
  const abs = isAbsolute ? src : rootPath ? joinPath(rootPath, src) : src;
  return convertFileSrc(abs);
}
