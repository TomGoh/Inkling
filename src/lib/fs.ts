// 文件系统封装层
// 桌面端走 Tauri command（Rust 端实现），浏览器端用 mock 数据走通 UI
// 这样保证沙箱内可开发验证，真实环境走原生 fs

import { invoke, isTauri, convertFileSrc } from "@tauri-apps/api/core";
import { resolve as resolvePath } from "@tauri-apps/api/path";

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
        {
          name: "html-demo.md",
          path: "/mock-workspace/notes/html-demo.md",
          is_dir: false,
          children: [],
        },
        {
          name: "footnote-demo.md",
          path: "/mock-workspace/notes/footnote-demo.md",
          is_dir: false,
          children: [],
        },
        {
          name: "outline-demo.md",
          path: "/mock-workspace/notes/outline-demo.md",
          is_dir: false,
          children: [],
        },
        {
          name: "frontmatter-demo.md",
          path: "/mock-workspace/notes/frontmatter-demo.md",
          is_dir: false,
          children: [],
        },
        {
          name: "math-demo.md",
          path: "/mock-workspace/notes/math-demo.md",
          is_dir: false,
          children: [],
        },
        {
          name: "callout-demo.md",
          path: "/mock-workspace/notes/callout-demo.md",
          is_dir: false,
          children: [],
        },
        {
          name: "toc-demo.md",
          path: "/mock-workspace/notes/toc-demo.md",
          is_dir: false,
          children: [],
        },
        {
          name: "link-demo.md",
          path: "/mock-workspace/notes/link-demo.md",
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
    "# InklingMD 简介\n\n一个所见即所得的 Markdown 编辑器。\n",
  "/mock-workspace/notes/html-demo.md":
    "# HTML 嵌入示例\n\n行内标签：<kbd>Ctrl</kbd> + <kbd>S</kbd> 保存，<span style=\"color:red\">红色文字</span>，<mark>高亮</mark>。\n\n块级嵌入：\n\n<details><summary>点击展开</summary>这里是折叠内容。</details>\n\n<blockquote style=\"border-left:3px solid #0969da\">自定义引用样式</blockquote>\n",
  "/mock-workspace/notes/footnote-demo.md":
    "# 脚注示例\n\nMarkdown 是一种轻量级标记语言[^1]，由 John Gruber 创建[^gruber]。\n\n它通过简单的纯文本语法实现富文本排版[^2]。\n\n[^1]: 轻量级指解析快、易读写。\n\n[^2]: 富文本排版包括标题、列表、表格、公式等。\n\n[^gruber]: John Gruber，Daring Fireball 博客作者，2004 年发布 Markdown。\n",
  "/mock-workspace/notes/outline-demo.md":
    "# 一级标题\n\n正文段落。\n\n## 二级标题\n\n二级正文。\n\n### 三级标题\n\n三级正文。\n",
  "/mock-workspace/notes/frontmatter-demo.md":
    "---\ntitle: 测试文档\ntags: [e2e, frontmatter]\n---\n\n# Front Matter 示例\n\n正文内容。\n",
  "/mock-workspace/notes/math-demo.md":
    "# 数学公式示例\n\n行内公式：$E = mc^2$。\n\n块级公式：\n\n$$\n\\int_0^1 x^2 \\, dx = \\frac{1}{3}\n$$\n",
  "/mock-workspace/notes/callout-demo.md":
    "# Callout 示例\n\n> [!NOTE]\n> 这是一个提示框\n\n> [!WARNING]\n> 这是一个警告\n\n> [!TIP]\n> 这是一个技巧\n",
  "/mock-workspace/notes/toc-demo.md":
    "# TOC 示例\n\n[TOC]\n\n## 二级标题 A\n\n内容 A。\n\n## 二级标题 B\n\n内容 B。\n",
  "/mock-workspace/notes/link-demo.md":
    "# 链接示例\n\n外部链接：[Example](https://example.com)\n\n锚点链接：[跳转标题](#锚点目标)\n\n## 锚点目标\n\n目标段落内容。\n",
};

// ---- mock 树变更辅助（浏览器端模拟真实 fs 写入对目录树的影响）----
// 递归查找路径对应的节点（返回引用，可就地修改）
function findNode(root: FileNode, path: string): FileNode | null {
  if (root.path === path) return root;
  for (const child of root.children) {
    const found = findNode(child, path);
    if (found) return found;
  }
  return null;
}

// 查找路径所属的父节点及其在 children 中的索引
function findParent(
  root: FileNode,
  path: string,
): { parent: FileNode; index: number } | null {
  for (const child of root.children) {
    if (child.path === path) return { parent: root, index: root.children.indexOf(child) };
    const found = findParent(child, path);
    if (found) return found;
  }
  return null;
}

// 递归更新节点及其子项的 path 前缀（重命名/移动后路径变化）
function rebasePath(node: FileNode, oldPrefix: string, newPrefix: string): void {
  node.path = newPrefix + node.path.slice(oldPrefix.length);
  for (const child of node.children) rebasePath(child, oldPrefix, newPrefix);
}

/** 从路径拆出父路径与文件名（POSIX 风格，与 joinPath/dirname 配套） */
function splitPath(p: string): { dir: string; base: string } {
  const idx = p.lastIndexOf("/");
  if (idx < 0) return { dir: "", base: p };
  return { dir: p.slice(0, idx), base: p.slice(idx + 1) };
}

/** 列出目录的直接子项（子目录 children 为空，由调用方按需继续加载） */
export async function listDir(dirPath: string): Promise<FileNode> {
  if (isTauri()) {
    return invoke<FileNode>("list_dir", { dirPath });
  }
  // 浏览器 mock
  await new Promise((r) => setTimeout(r, 100));
  const node = findNode(MOCK_TREE, dirPath);
  if (!node) throw new Error(`路径不存在: ${dirPath}`);
  if (!node.is_dir) throw new Error(`不是目录: ${dirPath}`);
  return {
    ...structuredClone(node),
    children: node.children.map((child) => ({
      ...structuredClone(child),
      children: [],
    })),
  };
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
  // 浏览器 mock：更新内容键
  if (MOCK_FILE_CONTENT[from] !== undefined) {
    MOCK_FILE_CONTENT[to] = MOCK_FILE_CONTENT[from];
    delete MOCK_FILE_CONTENT[from];
  }
  // 同步 mock 目录树：就地改 name/path 并重算子项 path 前缀
  const node = findNode(MOCK_TREE, from);
  if (node) {
    const { base } = splitPath(to);
    node.name = base;
    rebasePath(node, from, to);
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
  // 同步 mock 目录树：从父节点 children 中移除
  const found = findParent(MOCK_TREE, path);
  if (found) {
    found.parent.children.splice(found.index, 1);
  }
}

/** 创建空文件 */
export async function createFile(filePath: string): Promise<void> {
  if (isTauri()) {
    return invoke<void>("create_file", { filePath });
  }
  MOCK_FILE_CONTENT[filePath] = "";
  // 同步 mock 目录树：在父目录下新增文件节点
  const { dir, base } = splitPath(filePath);
  const parent = dir ? findNode(MOCK_TREE, dir) : null;
  if (parent && !parent.children.some((c) => c.path === filePath)) {
    parent.children.push({ name: base, path: filePath, is_dir: false, children: [] });
  }
}

/** 创建目录 */
export async function createDir(dirPath: string): Promise<void> {
  if (isTauri()) {
    return invoke<void>("create_dir", { dirPath });
  }
  // 浏览器 mock：在父目录下新增目录节点
  const { dir, base } = splitPath(dirPath);
  const parent = dir ? findNode(MOCK_TREE, dir) : null;
  if (parent && !parent.children.some((c) => c.path === dirPath)) {
    parent.children.push({ name: base, path: dirPath, is_dir: true, children: [] });
  }
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
 * 以 Markdown 文件所在目录为基准解析路径。
 * Tauri 的原生路径实现会按当前平台处理分隔符、绝对路径及 ./../ 片段。
 */
export async function resolvePathFromDocument(
  documentPath: string,
  ...paths: string[]
): Promise<string> {
  if (!isTauri() || !documentPath) return paths.join("/");
  return resolvePath(documentPath, "..", ...paths);
}

/** 已通过 allow_asset_dir 放行的目录（避免重复 IPC） */
const allowedAssetDirs = new Set<string>();

/**
 * 把目录加入 asset 协议运行时白名单（仅桌面端）。
 * tauri.conf.json 的静态 scope 只覆盖用户目录，工作区/文档在其他磁盘分区
 * （如 Windows 的 E:\code\...）时必须先放行再 convertFileSrc，否则图片加载被拒。
 */
async function allowAssetDir(dir: string): Promise<void> {
  if (!isTauri() || !dir || allowedAssetDirs.has(dir)) return;
  allowedAssetDirs.add(dir);
  try {
    await invoke("allow_asset_dir", { path: dir });
  } catch {
    // 放行失败不阻断渲染：目录恰好落在静态白名单内时仍可加载
    allowedAssetDirs.delete(dir);
  }
}

/** 取路径的父目录（兼容 / 与 \ 分隔符；无分隔符时原样返回） */
function dirNameOf(p: string): string {
  const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return idx > 0 ? p.slice(0, idx) : p;
}

/**
 * 把 markdown 中的图片 src 解析为 WebView 可加载的 URL。
 * - http(s)/data/blob/asset 协议：原样返回
 * - 本地路径：以当前 Markdown 文件所在目录为基准解析并正规化，再用 convertFileSrc 转换
 *   （转换前先把图片所在目录加入 asset 协议运行时白名单，覆盖非用户目录的工作区）
 * - 浏览器环境：原样返回（无法访问本地文件）
 */
export async function resolveImageSrc(
  src: string,
  documentPath: string,
): Promise<string> {
  if (!src) return src;
  if (!isTauri()) return src;
  // 非本地协议 URL 直接放行；file: URL 仍需转成 Tauri 可读取的本地路径。
  if (/^(https?:|data:|blob:|asset:|tauri:)/i.test(src)) return src;

  // Markdown 图片地址遵循 URI 编码；转成本地路径前解码空格、#、中文等字符。
  // 非法的百分号序列保留原值，避免单张图片导致编辑器初始化失败。
  let localPath = src;
  try {
    if (/^file:/i.test(src)) {
      const url = new URL(src);
      const host =
        url.hostname && url.hostname !== "localhost"
          ? `//${url.hostname}`
          : "";
      localPath = host + decodeURIComponent(url.pathname);
      // file:///C:/... 的 pathname 会多一个前导 /，Windows 路径需去掉。
      if (!host && /^\/[a-zA-Z]:\//.test(localPath)) {
        localPath = localPath.slice(1);
      }
    } else {
      localPath = decodeURIComponent(src);
    }
  } catch {
    // 保留未经编码的普通文件路径
  }
  const abs = await resolvePathFromDocument(documentPath, localPath);
  // 静态 scope 之外的目录（其他磁盘分区等）先动态放行，再转 asset 协议 URL
  await allowAssetDir(dirNameOf(abs));
  return convertFileSrc(abs);
}
