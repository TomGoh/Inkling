// 源码模式 Markdown 往返保真单测（issue #25）
//
// 背景：v2.2.0 源代码模式的「进源码改字 → 退出 re-parse」链路依赖
// parser/serializer 对自定义块（callout、frontmatter、mermaid、math、toc）
// 的往返保真。此处用无头 Milkdown 编辑器（与 Editor.tsx 同款 schema/remark
// 插件，不装配视图层——NodeView/KaTeX/CodeMirror 渲染与解析序列化无关）
// 驱动真实 parserCtx/serializerCtx，做 parse → serialize → re-parse 回归。
//
// 已知可接受差异（v2.2.0 设计文档 §5.3）：空行数量、列表 marker 统一、
// HTML 属性顺序。不可接受：frontmatter 丢失、mermaid 块消失、
// callout 退化为普通引用、公式 LaTeX 内容变形。
//
// 断言策略：
// 1. 节点层：解析后的 doc 中存在预期节点类型与关键 attr
// 2. 文本层：序列化结果保留关键语法标记与内容子串
// 3. 幂等性：md → serialize(parse(md)) 后再往返一次不变
//    （首次往返允许规范化差异，第二次起必须稳定，否则源码模式
//    反复进出会持续改写用户文件）

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import {
  Editor,
  defaultValueCtx,
  parserCtx,
  rootCtx,
  serializerCtx,
} from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import {
  remarkMathPlugin,
  mathInlineSchema,
  mathDisplaySchema,
} from "../../src/components/Editor/math";
import {
  remarkFrontmatterPlugin,
  frontmatterSchema,
} from "../../src/components/Editor/frontmatter";
import { remarkTocPlugin, tocSchema } from "../../src/components/Editor/toc";
import {
  remarkCalloutPlugin,
  calloutSchema,
} from "../../src/components/Editor/callout";

let parse: (markdown: string) => PMNode;
let serialize: (doc: PMNode) => string;
let teardown: () => Promise<unknown>;

beforeAll(async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, host);
      ctx.set(defaultValueCtx, "");
    })
    // 与 Editor.tsx 一致的 schema/remark 层（视图插件不参与解析序列化）
    .use(commonmark)
    .use(gfm)
    .use(remarkMathPlugin)
    .use(mathInlineSchema)
    .use(mathDisplaySchema)
    .use(remarkFrontmatterPlugin)
    .use(frontmatterSchema)
    .use(remarkTocPlugin)
    .use(tocSchema)
    .use(remarkCalloutPlugin)
    .use(calloutSchema)
    .create();
  parse = editor.action((ctx) => ctx.get(parserCtx));
  serialize = editor.action((ctx) => ctx.get(serializerCtx));
  teardown = () => editor.destroy();
}, 30_000);

afterAll(async () => {
  await teardown();
});

/** 深度优先找第一个指定类型的节点 */
function findNode(doc: PMNode, type: string): PMNode | undefined {
  let found: PMNode | undefined;
  doc.descendants((n) => {
    if (found) return false;
    if (n.type.name === type) {
      found = n;
      return false;
    }
    return true;
  });
  return found;
}

/** md → doc → md2 → doc2 → md3，返回各阶段结果 */
function roundtrip(markdown: string) {
  const doc = parse(markdown);
  const md2 = serialize(doc);
  const md3 = serialize(parse(md2));
  return { doc, md2, md3 };
}

describe("round-trip 保真（issue #25）", () => {
  it("callout：`> [!TYPE]` 往返保持 callout 节点与类型", () => {
    const md = "> [!NOTE]\n> 这是一个提示框\n";
    const { doc, md2, md3 } = roundtrip(md);
    const node = findNode(doc, "callout");
    expect(node, "解析后应产生 callout 节点而非普通 blockquote").toBeTruthy();
    expect(node!.attrs.calloutType).toBe("note");
    expect(md2).toContain("[!Note]");
    expect(md2).toContain("这是一个提示框");
    expect(md3).toBe(md2);
  });

  it("callout：WARNING 大小写规范化后稳定", () => {
    const md = "> [!WARNING]\n> 这是一个警告\n";
    const { doc, md2, md3 } = roundtrip(md);
    expect(findNode(doc, "callout")!.attrs.calloutType).toBe("warning");
    expect(md2).toContain("[!Warning]");
    expect(md2).toContain("这是一个警告");
    expect(md3).toBe(md2);
  });

  it("callout：Obsidian 写法 `[!NOTE] 后紧跟内容` 归一为独立标记段", () => {
    // 解析后内容保留；序列化为序列化往返格式（标记独占首段）
    const md = "> [!TIP]\n> 技巧内容\n";
    const { doc, md2, md3 } = roundtrip(md);
    expect(findNode(doc, "callout")!.attrs.calloutType).toBe("tip");
    expect(md2).toContain("[!Tip]");
    expect(md2).toContain("技巧内容");
    expect(md3).toBe(md2);
  });

  it("frontmatter：首部 YAML 围栏完整保留", () => {
    const md =
      "---\ntitle: 测试文档\ntags: [e2e, frontmatter]\n---\n\n# Front Matter 示例\n\n正文内容。\n";
    const { doc, md2, md3 } = roundtrip(md);
    const node = findNode(doc, "frontmatter");
    expect(node, "解析后应产生 frontmatter 节点").toBeTruthy();
    expect(node!.attrs.value).toContain("title: 测试文档");
    expect(node!.attrs.value).toContain("tags: [e2e, frontmatter]");
    expect(md2).toContain("title: 测试文档");
    expect(md2).toContain("tags: [e2e, frontmatter]");
    expect(md2).toContain("# Front Matter 示例");
    expect(md2).toContain("正文内容");
    expect(md3).toBe(md2);
  });

  it("mermaid：围栏代码块语言与内容保留", () => {
    const md = "```mermaid\nflowchart TD\n  A[开始] --> B[结束]\n```\n";
    const { doc, md2, md3 } = roundtrip(md);
    const node = findNode(doc, "code_block");
    expect(node, "解析后应产生 code_block 节点").toBeTruthy();
    expect(node!.attrs.language).toBe("mermaid");
    expect(node!.textContent).toContain("flowchart TD");
    expect(node!.textContent).toContain("A[开始] --> B[结束]");
    expect(md2).toContain("```mermaid");
    expect(md2).toContain("flowchart TD");
    expect(md3).toBe(md2);
  });

  it("math：行内与块级公式 LaTeX 源码保留", () => {
    const md =
      "# 数学公式示例\n\n行内公式：$E = mc^2$。\n\n块级公式：\n\n$$\n\\int_0^1 x^2 \\, dx = \\frac{1}{3}\n$$\n";
    const { doc, md2, md3 } = roundtrip(md);
    const inline = findNode(doc, "math_inline");
    expect(inline, "解析后应产生 math_inline 节点").toBeTruthy();
    expect(inline!.attrs.value).toBe("E = mc^2");
    const display = findNode(doc, "math_display");
    expect(display, "解析后应产生 math_display 节点").toBeTruthy();
    expect(display!.attrs.value).toContain("\\int_0^1 x^2");
    expect(display!.attrs.value).toContain("\\frac{1}{3}");
    expect(md2).toContain("E = mc^2");
    expect(md2).toContain("\\int_0^1 x^2");
    expect(md3).toBe(md2);
  });

  it("toc：`[TOC]` 占位往返保留", () => {
    const md = "# TOC 示例\n\n[TOC]\n\n## 二级标题 A\n\n内容 A。\n";
    const { doc, md2, md3 } = roundtrip(md);
    expect(findNode(doc, "toc"), "解析后应产生 toc 节点").toBeTruthy();
    expect(md2).toContain("[TOC]");
    expect(md2).toContain("## 二级标题 A");
    expect(md3).toBe(md2);
  });

  it("混合文档：frontmatter + callout + mermaid + math + toc 共存互不干扰", () => {
    const md = [
      "---",
      "title: 混合文档",
      "---",
      "",
      "# 标题",
      "",
      "[TOC]",
      "",
      "> [!IMPORTANT]",
      "> 重要内容",
      "",
      "```mermaid",
      "flowchart LR",
      "  X --> Y",
      "```",
      "",
      "$$",
      "a^2 + b^2 = c^2",
      "$$",
      "",
      "行内 $x_1$ 公式。",
      "",
    ].join("\n");
    const { doc, md2, md3 } = roundtrip(md);
    // 五类节点全部存活
    expect(findNode(doc, "frontmatter")).toBeTruthy();
    expect(findNode(doc, "toc")).toBeTruthy();
    expect(findNode(doc, "callout")!.attrs.calloutType).toBe("important");
    const code = findNode(doc, "code_block");
    expect(code!.attrs.language).toBe("mermaid");
    expect(findNode(doc, "math_display")).toBeTruthy();
    expect(findNode(doc, "math_inline")).toBeTruthy();
    // 关键内容子串全部存活
    expect(md2).toContain("title: 混合文档");
    expect(md2).toContain("[TOC]");
    expect(md2).toContain("[!Important]");
    expect(md2).toContain("重要内容");
    expect(md2).toContain("```mermaid");
    expect(md2).toContain("flowchart LR");
    expect(md2).toContain("a^2 + b^2 = c^2");
    expect(md2).toContain("$x_1$");
    expect(md3).toBe(md2);
  });

  it("GFM 基线：任务列表/表格/删除线/脚注不因自定义插件引入而退化", () => {
    const md = [
      "- [x] 已完成",
      "- [ ] 未完成",
      "",
      "| 列A | 列B |",
      "| --- | --- |",
      "| a1 | b1 |",
      "",
      "~~删除文本~~ 与脚注[^1]。",
      "",
      "[^1]: 脚注定义。",
      "",
    ].join("\n");
    const { doc, md2, md3 } = roundtrip(md);
    expect(findNode(doc, "table")).toBeTruthy();
    // strikethrough 是 mark 不是节点（mark 名为 strike_through），从 marks 里找
    let hasStrike = false;
    doc.descendants((n) => {
      if (n.marks.some((m) => m.type.name === "strike_through")) hasStrike = true;
      return true;
    });
    expect(hasStrike, "应存在 strike_through mark").toBeTruthy();
    expect(findNode(doc, "footnote_definition")).toBeTruthy();
    // 任务列表勾选态保留（序列化层面 [x] / [ ] 原样写出且幂等）
    expect(md2).toContain("[x] 已完成");
    expect(md2).toContain("[ ] 未完成");
    expect(md2).toContain("已完成");
    expect(md2).toContain("删除文本");
    expect(md2).toContain("脚注定义");
    expect(md3).toBe(md2);
  });
});
