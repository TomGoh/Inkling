#!/usr/bin/env node
/**
 * #224 S16（N16/N17/A-5）：构建产物级层化断言。
 *
 * 必须在「清空 dist → vite build」之后运行（package.json 的 check:build-layers
 * 负责清目录；CI 同此顺序），不得对陈旧产物断言。
 *
 * 检查项：
 *  ① dist/assets/*.css 恰好 3 个（index / vendor_milkdown / vendor_katex）；
 *  ② 每个资产用 postcss 解析后，顶层规则只能是 CSSLayerBlockRule /
 *     CSSLayerStatementRule，且**层名必须恰为 `base`**（防插件把 vendor 包成
 *     `@layer vendor` 等其它名字——那样「未分层=0」仍成立却不满足 G5 层序）；
 *  ③ 不含残留 @charset / 外链 @import；
 *  ④ vendor_katex 单列存在、完全层化、层内含 @font-face（KaTeX 20 条同源字体）；
 *  ⑤ dist/index.html 的 @layer statement 位于所有样式表之前；
 *  ⑥ CSS 资产为压缩单行形态，且 @layer 块结构在压缩后保留（esbuild 不改写层序）。
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import postcss from "postcss";
import {
  isMinifiedSingleLine,
  readThemeEntries,
  reconcileBuildAssets,
} from "./lib/theme-build-assets.mjs";

const dist = resolve(process.cwd(), "dist");
if (!existsSync(dist)) {
  console.error("dist/ 不存在：请先执行清空 + vite build（pnpm check:build-layers）");
  process.exit(1);
}

const failures = [];
const fail = (msg) => failures.push(msg);

const cssFiles = readdirSync(resolve(dist, "assets")).filter((f) => f.endsWith(".css"));

// ① 数量 / 必需 chunk：**全部取自清单**（#312 项 3，清单是唯一真值源；此处不再硬编码 3 与 chunk 名）
const manifest = readThemeEntries().buildAssets;
for (const msg of reconcileBuildAssets(cssFiles, manifest)) fail(msg);

for (const file of cssFiles) {
  const css = readFileSync(resolve(dist, "assets", file), "utf8");
  const ast = postcss.parse(css); {
    // ② 顶层规则只能是带 layer 名的 @layer（块或 statement），且层名必须恰为 base
    ast.each((node) => {
      if (node.type !== "atrule" || node.name !== "layer") {
        fail(`${file} 存在未分层顶层节点：${node.type} ${node.name ?? ""} ${node.selector ?? ""}`.trim());
        return;
      }
      const layerNames = node.params.replace(/\s/g, "");
      if (layerNames !== "base") {
        fail(`${file} 存在非 base 层：@layer ${node.params}（G5 要求 base 入门清单全部包入 base）`);
      }
    });
    // ③ 残留 @charset / @import
    ast.walkAtRules("charset", () => fail(`${file} 残留 @charset`));
    ast.walkAtRules("import", (r) => fail(`${file} 残留未内联 @import：${r.params}`));
    // ⑥ 压缩形态（#312 项 3：口径与「压缩 = 单行」直接对应，旧版「换行 > 2」两头不严）
    if (!isMinifiedSingleLine(css)) {
      fail(
        `${file} 不是压缩单行产物（${css.trimEnd().split("\n").length} 行 / ${css.length} 字节），压缩可能被关闭/改写`,
      );
    }
  }
}

// ④ vendor_katex：层块内必须含 @font-face 且数量为 20
const katexCss = cssFiles.find((f) => f.startsWith("vendor_katex-"));
if (katexCss) {
  const ast = postcss.parse(readFileSync(resolve(dist, "assets", katexCss), "utf8"));
  let fontFaceCount = 0;
  ast.walkAtRules("font-face", () => fontFaceCount++);
  if (fontFaceCount !== 20) {
    fail(`vendor_katex.css 层内 @font-face 应为 20 条（KaTeX 同名字体），实际 ${fontFaceCount}`);
  }
  // @font-face 必须在 @layer 块内（完全层化）
  ast.walkAtRules("font-face", (rule) => {
    let p = rule.parent;
    while (p && p.type !== "root") {
      if (p.type === "atrule" && p.name === "layer") return;
      p = p.parent;
    }
    fail("vendor_katex.css 存在 @layer 块之外的 @font-face");
  });
}

// ⑤ index.html statement 位于样式表之前
const indexHtml = readFileSync(resolve(dist, "index.html"), "utf8");
const statementIdx = indexHtml.indexOf("@layer base, theme, user");
const linkStyleIdx = indexHtml.search(/<link[^>]+rel=["']stylesheet["']/);
if (statementIdx === -1) fail("dist/index.html 缺少层序 statement");
if (linkStyleIdx !== -1 && statementIdx > linkStyleIdx) {
  fail("dist/index.html 层序 statement 必须位于所有 <link rel=stylesheet> 之前");
}

if (failures.length) {
  console.error("S16 构建产物层化断言失败：");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`S16 OK：${cssFiles.length} 个 CSS 资产完全层化，statement 位置正确，压缩保留 @layer。`);
