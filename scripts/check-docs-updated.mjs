#!/usr/bin/env node

// 文档同步校验（发版门禁）。
// 语义：指定变更范围（--base=<ref> --head=<ref>）内，如果 src/ 或 src-tauri/ 有代码变更，
//   则 CHANGELOG.md / README.md / docs/ 必须至少一处也有变更。
// 防止「功能代码更新了，但变更记录 / README / 设计文档 / 需求文档没更新」就发版。
//
// 用法：
//   node scripts/check-docs-updated.mjs                 # 发版路径：自动取「上一个 tag」作 base
//   node scripts/check-docs-updated.mjs --base=v3.4.0 --head=HEAD   # 手动指定范围
//
// #302（PR #329 复核阻塞项）：
// - **跳过判定在这里，不在 workflow 的 bash**：workflow 只调用本脚本，分类器的
//   skip/fail 才真正作用于发布路径（旧形态下 bash 自己 `if [ -z "$PREV_TAG" ] → exit 0`，
//   脚本里的加固在 CI 上基本不可达）。
// - **「0 个 tag」不等于「首个版本」**：浅克隆（tag 未 fetch / fetch-depth 被改小）同样列不出
//   tag，故用 `rev-parse --is-shallow-repository` 区分，只有**完整克隆且确实无 tag** 才允许跳过。

import { chooseBase, classifyBaseRef, runGit } from "./lib/docs-sync.mjs";

const args = process.argv.slice(2);
const get = (name) =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

const head = get("head") || "HEAD";
let base = get("base");

/** 「没有做校验」就必须显式暴露（非零退出），并给出可操作信息 */
function failNoCheck(reason, extra = "") {
  console.error("");
  console.error("✗ 文档同步校验**没有执行**（这不等于通过）：");
  console.error(`  ${reason}`);
  if (extra) console.error(`  ${extra}`);
  process.exit(1);
}

if (!base) {
  // 发版路径：由本脚本选出 base —— 判据落在脚本里，workflow 不再做 bash 层跳过
  const tagList = runGit(["tag", "--sort=-v:refname", "--list", "v*"]);
  const headCommit = runGit(["rev-parse", head]);
  if (!headCommit.ok) failNoCheck(`无法解析 HEAD（${head}）`, `git rev-parse stderr: ${headCommit.stderr}`);

  let picked = null;
  let allTagsAtHead = false;
  if (tagList.ok) {
    const tags = tagList.stdout.split("\n").filter(Boolean);
    const commitOfTag = (tag) => {
      const r = runGit(["rev-parse", "--verify", `${tag}^{commit}`]);
      return r.ok ? r.stdout : null;
    };
    const choice = chooseBase(tags, headCommit.stdout, commitOfTag);
    picked = choice.base;
    allTagsAtHead = choice.allAtHead; // #331：所有 tag 都指向 HEAD = 首个发布
  }

  if (!picked) {
    // 没有可用 base：可能是「没有更早的发布」（首个版本 / 首个 tag 就是 HEAD）、浅克隆没拉到 tag、
    // 或 git 本身有问题 —— 由分类器裁决，只有前者的第一种才算合法跳过。
    const shallow = runGit(["rev-parse", "--is-shallow-repository"]);
    const verdict = classifyBaseRef({
      revParse: {
        ok: false,
        stdout: "",
        stderr: tagList.ok ? "没有可用的 base tag" : tagList.stderr,
      },
      tagList,
      shallow,
      allTagsAtHead,
    });
    if (verdict.action === "skip-no-history") {
      console.log(`${verdict.reason} → 跳过文档同步校验（确实没有可比对象，不是「没校验」被吞）`);
      process.exit(0);
    }
    failNoCheck(verdict.reason);
  }

  base = picked;
  console.log(`自动选取上一个 tag 作为 base：${base}`);
}

// 显式 --base（或上面选出的 base）解析失败时的分类
const revParse = runGit(["rev-parse", "--verify", `${base}^{commit}`]);
if (!revParse.ok) {
  const tagList = runGit(["tag", "--list"]);
  const shallow = runGit(["rev-parse", "--is-shallow-repository"]);
  const verdict = classifyBaseRef({ revParse, tagList, shallow });
  if (verdict.action === "skip-no-history") {
    console.log("仓库尚无任何 tag（完整克隆，确系首个版本）→ 跳过文档同步校验");
    process.exit(0);
  }
  failNoCheck(verdict.reason, revParse.stderr ? `git rev-parse stderr: ${revParse.stderr}` : "");
}

const diff = runGit(["diff", "--name-only", `${base}...${head}`]);
if (!diff.ok) failNoCheck("无法取得变更文件清单", `git diff stderr: ${diff.stderr || "（无）"}`);
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
