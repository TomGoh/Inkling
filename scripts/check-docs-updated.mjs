#!/usr/bin/env node
// 文档同步校验（仅 CI 发版时强制执行，本地可手动运行自查）
// 语义：指定变更范围（--base=<ref> --head=<ref>）内，
//   如果 src/ 或 src-tauri/ 有代码变更，
//   则 CHANGELOG.md / README.md / docs/ 必须至少一处也有变更。
// 防止「功能代码更新了，但变更记录 / README / 设计文档 / 需求文档没更新」就发版。
// 用法：
//   node scripts/check-docs-updated.mjs --base=v2.3.6 --head=v2.3.7
// base 缺失或不可解析时跳过（如首次发版）。

import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const get = (name) =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

const base = get("base");
const head = get("head") || "HEAD";

if (!base) {
  console.log("未指定 --base，跳过文档同步校验");
  process.exit(0);
}

function git(...a) {
  return execFileSync("git", a, { encoding: "utf8" }).trim();
}

// base ref 不存在（如首个 tag 前无历史）时跳过
try {
  git("rev-parse", "--verify", `${base}^{commit}`);
} catch {
  console.log(`base ${base} 不可解析，跳过文档同步校验`);
  process.exit(0);
}

const files = git("diff", "--name-only", `${base}...${head}`)
  .split("\n")
  .filter(Boolean);

const codeChanged = files.filter(
  (f) => f.startsWith("src/") || f.startsWith("src-tauri/"),
);
const docsChanged = files.filter(
  (f) =>
    f === "CHANGELOG.md" ||
    f === "README.md" ||
    f.startsWith("docs/") ||
    f === "ARCHITECTURE.md" ||
    f === "CONTRIBUTING.md",
);

console.log(`变更范围 ${base}...${head}：${files.length} 个文件`);
console.log(`  代码变更（src/ src-tauri/）：${codeChanged.length} 个`);
console.log(`  文档变更（CHANGELOG/README/docs）：${docsChanged.length} 个`);

if (codeChanged.length === 0) {
  console.log("✓ 无代码变更，不要求文档更新");
  process.exit(0);
}

if (docsChanged.length === 0) {
  console.error("");
  console.error("✗ 文档同步校验失败：");
  console.error("  本次发版包含代码变更，但未同步更新任何文档。");
  console.error("  发版前必须至少更新以下一处：");
  console.error("    - CHANGELOG.md        （变更记录，必更）");
  console.error("    - README.md           （版本记录 / 功能说明）");
  console.error("    - docs/               （设计文档 / 需求文档）");
  console.error(`  代码变更文件（前 10 个）：`);
  for (const f of codeChanged.slice(0, 10)) console.error(`    ${f}`);
  if (codeChanged.length > 10) console.error(`    …等共 ${codeChanged.length} 个`);
  process.exit(1);
}

console.log("✓ 文档已同步更新");
