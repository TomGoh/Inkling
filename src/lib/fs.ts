// 文件系统封装层
// 桌面端走 Tauri command（Rust 端实现），浏览器端用 mock 数据走通 UI
// 这样保证沙箱内可开发验证，真实环境走原生 fs

import { invoke, isTauri } from "@tauri-apps/api/core";

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
