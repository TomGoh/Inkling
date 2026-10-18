// #298 链接分类器：表驱动全表
//
// 重点锁定三件事：
// 1) **绝对路径先于 scheme** —— 否则 `C:\ws\x.md` 会被当成 scheme "c:" 判成 blocked-scheme；
// 2) 工作区包含性 / 扩展名 / 草稿语义的边界；
// 3) 5 个 kind + 6 个 reason 全部可达（PR-2 一次写完整分类器）。

import { describe, it, expect } from "vitest";
import {
  classifyLink,
  decodeURIComponentSafe,
  type LinkClassification,
  type LinkContext,
} from "../../src/lib/link-target";

/** 常见上下文：POSIX 工作区 */
const POSIX: LinkContext = {
  documentPath: "/mock-workspace/notes/a.md",
  workspaceRoot: "/mock-workspace",
};
/** Windows 工作区（反斜杠） */
const WIN: LinkContext = {
  documentPath: "C:\\ws\\notes\\a.md",
  workspaceRoot: "C:\\ws",
};
/** UNC 工作区 */
const UNC: LinkContext = {
  documentPath: "\\\\srv\\share\\notes\\a.md",
  workspaceRoot: "\\\\srv\\share",
};
/** 未保存草稿（虚拟路径） */
const DRAFT: LinkContext = { documentPath: "untitled-1", workspaceRoot: "/mock-workspace" };
/** 未保存草稿且没有工作区根 */
const DRAFT_NO_ROOT: LinkContext = { documentPath: "untitled-1", workspaceRoot: null };
/** 有文档路径但未打开工作区（单文件模式之外） */
const NO_ROOT: LinkContext = { documentPath: "/ws/notes/a.md", workspaceRoot: null };

describe("#298 classifyLink", () => {
  const cases: Array<[string, string, LinkContext, LinkClassification]> = [
    // —— empty ——
    ["空 href", "", POSIX, { kind: "empty" }],
    ["纯空白 href", "   ", POSIX, { kind: "empty" }],

    // —— anchor ——
    ["中文锚点", "#理解问题与方法", POSIX, { kind: "anchor", fragment: "理解问题与方法" }],
    ["空片段（href=\"#\"）", "#", POSIX, { kind: "anchor", fragment: "" }],
    ["带标点的 GitHub 重复标题锚点", "#Hello, World!-1", POSIX, { kind: "anchor", fragment: "Hello, World!-1" }],
    ["编码锚点保留原始编码（解码由匹配端负责）", "#%E7%90%86", POSIX, { kind: "anchor", fragment: "%E7%90%86" }],
    ["草稿里的纯锚点依然是 anchor", "#小节", DRAFT, { kind: "anchor", fragment: "小节" }],

    // —— external：四种协议 ——
    ["https", "https://example.com/a?b=1", POSIX, { kind: "external", url: "https://example.com/a?b=1" }],
    ["http（协议大小写不敏感，URL 原样保留）", "HTTP://example.com/x", POSIX, { kind: "external", url: "HTTP://example.com/x" }],
    ["mailto", "mailto:a@b.com?subject=hi", POSIX, { kind: "external", url: "mailto:a@b.com?subject=hi" }],
    ["tel", "tel:+8613800000000", POSIX, { kind: "external", url: "tel:+8613800000000" }],
    ["外链带 fragment 时保留完整 URL", "https://example.com/a#sec", POSIX, { kind: "external", url: "https://example.com/a#sec" }],

    // —— workspace-file：相对路径 ——
    ["./ 同目录", "./b.md", POSIX, { kind: "workspace-file", path: "/mock-workspace/notes/b.md", fragment: "" }],
    ["../ 上一级", "../intro.md", POSIX, { kind: "workspace-file", path: "/mock-workspace/intro.md", fragment: "" }],
    [
      "带锚点的相对路径",
      "../intro.md#小节",
      POSIX,
      { kind: "workspace-file", path: "/mock-workspace/intro.md", fragment: "小节" },
    ],
    [
      "百分号编码的中文文件名",
      "%E4%B8%AD.md",
      POSIX,
      { kind: "workspace-file", path: "/mock-workspace/notes/中.md", fragment: "" },
    ],
    [
      "百分号编码的空格",
      "my%20note.md",
      POSIX,
      { kind: "workspace-file", path: "/mock-workspace/notes/my note.md", fragment: "" },
    ],
    [
      "扩展名大小写不敏感",
      "b.MD",
      POSIX,
      { kind: "workspace-file", path: "/mock-workspace/notes/b.MD", fragment: "" },
    ],
    [
      "POSIX 绝对路径且在工作区内",
      "/mock-workspace/notes/b.md",
      POSIX,
      { kind: "workspace-file", path: "/mock-workspace/notes/b.md", fragment: "" },
    ],
    [
      "未打开工作区时按文档父目录判定包含性",
      "./b.md",
      NO_ROOT,
      { kind: "workspace-file", path: "/ws/notes/b.md", fragment: "" },
    ],

    // —— workspace-file：绝对路径必须优先于 scheme ——
    [
      "Windows 反斜杠盘符（不得被判成 scheme c:）",
      "C:\\ws\\x.md",
      WIN,
      { kind: "workspace-file", path: "C:\\ws\\x.md", fragment: "" },
    ],
    [
      "Windows 正斜杠盘符",
      "C:/ws/x.md",
      WIN,
      { kind: "workspace-file", path: "C:/ws/x.md", fragment: "" },
    ],
    [
      "盘符大小写与分隔符混写",
      "c:/ws/x.md",
      WIN,
      { kind: "workspace-file", path: "c:/ws/x.md", fragment: "" },
    ],
    [
      "UNC 路径",
      "\\\\srv\\share\\x.md",
      UNC,
      { kind: "workspace-file", path: "\\\\srv\\share\\x.md", fragment: "" },
    ],
    [
      "草稿里的绝对路径必须放行（不依赖 documentPath）",
      "C:\\ws\\x.md",
      { documentPath: "untitled-1", workspaceRoot: "C:\\ws" },
      { kind: "workspace-file", path: "C:\\ws\\x.md", fragment: "" },
    ],

    // —— unsupported：6 个 reason 全可达 ——
    ["file:// 一律不打开", "file:///C:/tmp/x.md", POSIX, { kind: "unsupported", reason: "local-file", raw: "file:///C:/tmp/x.md" }],
    ["ftp 不在外链白名单", "ftp://example.com/x", POSIX, { kind: "unsupported", reason: "blocked-scheme", raw: "ftp://example.com/x" }],
    ["javascript 注入", "javascript:alert(1)", POSIX, { kind: "unsupported", reason: "blocked-scheme", raw: "javascript:alert(1)" }],
    ["data URL", "data:text/html,hi", POSIX, { kind: "unsupported", reason: "blocked-scheme", raw: "data:text/html,hi" }],
    ["tauri 内部协议", "tauri://localhost/x", POSIX, { kind: "unsupported", reason: "blocked-scheme", raw: "tauri://localhost/x" }],
    ["单字母 scheme（盘符相对路径 c:notes）", "c:notes", POSIX, { kind: "unsupported", reason: "blocked-scheme", raw: "c:notes" }],
    ["/ 开头的 POSIX 绝对路径通常在工作区外", "/readme.md", POSIX, { kind: "unsupported", reason: "outside-workspace", raw: "/readme.md" }],
    ["../../ 越出工作区", "../../outside.md", POSIX, { kind: "unsupported", reason: "outside-workspace", raw: "../../outside.md" }],
    [
      "前缀相同但不同目录不算工作区内",
      "/mock-workspace-other/x.md",
      POSIX,
      { kind: "unsupported", reason: "outside-workspace", raw: "/mock-workspace-other/x.md" },
    ],
    ["非 Markdown 目标", "attachment.txt", POSIX, { kind: "unsupported", reason: "not-markdown", raw: "attachment.txt" }],
    ["无扩展名目标", "../intro", POSIX, { kind: "unsupported", reason: "not-markdown", raw: "../intro" }],
    ["草稿里的相对链接没有基准目录", "./b.md", DRAFT, { kind: "unsupported", reason: "no-workspace", raw: "./b.md" }],
    ["空文档路径同样视为草稿", "./b.md", { documentPath: "", workspaceRoot: "/ws" }, { kind: "unsupported", reason: "no-workspace", raw: "./b.md" }],
    [
      "草稿里的绝对路径但无工作区根",
      "C:\\ws\\x.md",
      DRAFT_NO_ROOT,
      { kind: "unsupported", reason: "no-workspace-root", raw: "C:\\ws\\x.md" },
    ],
    [
      "有文档路径但无工作区根时的绝对路径",
      "/ws/x.md",
      NO_ROOT,
      { kind: "unsupported", reason: "no-workspace-root", raw: "/ws/x.md" },
    ],
  ];

  it.each(cases)("%s", (_label, href, ctx, expected) => {
    expect(classifyLink(href, ctx)).toEqual(expected);
  });

  it("绝对路径判定必须先于 scheme：三种 Windows 形态都必须是 workspace-file", () => {
    const pairs: Array<[string, LinkContext]> = [
      ["C:\\ws\\x.md", WIN],
      ["C:/ws/x.md", WIN],
      ["\\\\srv\\share\\x.md", UNC],
    ];
    for (const [href, ctx] of pairs) {
      expect(classifyLink(href, ctx).kind).toBe("workspace-file");
    }
  });
});

describe("#298 decodeURIComponentSafe", () => {
  it("正常编码解码", () => {
    expect(decodeURIComponentSafe("%E4%B8%AD%20a")).toBe("中 a");
  });

  it("非法编码原样返回，绝不抛异常", () => {
    expect(decodeURIComponentSafe("%E7%90")).toBe("%E7%90");
    expect(decodeURIComponentSafe("100%")).toBe("100%");
  });
});
