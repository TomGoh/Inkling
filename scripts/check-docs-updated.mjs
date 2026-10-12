#!/usr/bin/env node
// 文档同步校验（仅 CI 发版时强制执行，本地可手动运行自查）
// 语义：指定变更范围（--base=<ref> --head=<ref>）内，
//   如果 src/ 或 src-tauri/ 有代码变更，
//   则 CHANGELOG.md / README.md / docs/ 必须至少一处也有变更。
// 防止「功能代码更新了，但变更记录 / README / 设计文档 / 需求文档没更新」就发版。
// 用法：
//   node scripts/check-docs-updated.mjs --base=v2.3.6 --head=v2.3.7
// base 缺失或不可解析时跳过（如首次发版）。

import { classifyBaseRef, runGit } from "./lib/docs-sync.mjs";

const args = process.argv.slice(2);
const get = (name) =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

const base = get("base");
const head = get("head") || "HEAD";

if (!base) {
  // #302：这条「跳过」必须**写明没校验**（CI 始终会传 --base；看到这行说明调用方漏传了）
  console.log("未指定 --base → **跳过（本次没有做任何校验）**；CI 请勿省略 --base");
  process.exit(0);
}

// #302：区分「git 不可用」与「ref 不存在」。只有「仓库一个 tag 都没有」才是合法跳过，
// 其余（子进程起不来 / 有 tag 但 ref 不存在）一律显式失败，不让门禁静默通过。
const revParse = runGit(["rev-parse", "--verify", `${base}^{commit}`]);
const tagList = revParse.ok ? { ok: true, stdout: "", stderr: "" } : runGit(["tag", "--list"]);
const verdict = classifyBaseRef({ revParse, tagList });

if (verdict.action === "skip-no-history") {
  console.log(`仓库尚无任何 tag（首个版本）→ 跳过文档同步校验`);
  process.exit(0);
}
if (verdict.action === "fail") {
  console.error("");
  console.error("✗ 文档同步校验**没有执行**（这不等于通过）：");
  console.error(`  ${verdict.reason}`);
  if (revParse.stderr) console.error(`  git rev-parse stderr: ${revParse.stderr}`);
  process.exit(1);
}

const diff = runGit(["diff", "--name-only", `${base}...${head}`]);
if (!diff.ok) {
  console.error("");
  console.error("✗ 文档同步校验失败：无法取得变更文件清单");
  console.error(`  git diff stderr: ${diff.stderr || "（无）"}`);
  process.exit(1);
}
const files = diff.stdout.split("\n").filter(Boolean);

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
