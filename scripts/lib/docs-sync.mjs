/**
 * #302 / #331：文档同步门禁的**判据**（与脚本分离，便于对失败形态打负例）。
 *
 * 原则（对齐 CONTRIBUTING 的「不许『没比』伪装成『没回归』」）：
 * **「没校验」不许伪装成「校验通过」**；反过来也**不许把「确实没有可比对象」判成失败**。
 *
 * 三条硬约束：
 * ① **跳过判定必须落在脚本里**（#302），不能留在 workflow 的 bash 分支；
 * ② **「0 个 tag」不足以判定「首个版本」**（#302）—— tag 未 fetch / `fetch-depth` 被改小时
 *    浅克隆里 `git tag --list` 同样是空，须用 `--is-shallow-repository` 区分；
 * ③ **发版触发形态下没有「上一个 tag」不代表出错**（#331）—— 门禁由 tag push 触发 ⇒ HEAD 就是
 *    刚打的 tag ⇒ 首个发布时「唯一 tag 指向 HEAD」，此时唯一合法的结论是**跳过**（没有更早的发布
 *    可比），而不是回落到「有 tag 但 ref 不存在」报 fail、还提示去查 `--base` / fetch。
 * ④ **「完整克隆」不等于「tag 齐全」**（#334）—— `--single-branch` 克隆（或手写只取部分 tag 的
 *    fetch）**不是浅克隆**（`--is-shallow-repository` = false），但本地只本地化了 HEAD 上那一个 tag：
 *    同一 HEAD 在完整克隆里 exit 1、在它这里 exit 0，把**真实的文档违规吞成「首个发布」**。
 *    故**任何跳过之前都必须用 `git ls-remote --tags origin` 做远端旁证**：远端有本地没有的 tag
 *    ⇒ tag 列表不可信 ⇒ fail；远端不可达 ⇒ **保守 fail**（与 `runGit` 的「永不抛」同一口径：
 *    分不清就不跳过）。
 */
import { execFileSync } from "node:child_process";

/**
 * 执行 git 并**永不抛**：返回 `{ ok, stdout, stderr }`。
 * 只有拿到 stderr 才能区分「git 不可用」与「ref 不存在」——两者处置完全相反。
 */
export function runGit(args, exec = execFileSync) {
  try {
    // stdio 全 pipe：否则 git 的 stderr 会**裸漏**到控制台（例如 ref 不存在时的
    // `fatal: Needed a single revision`），既有噪音、又让人分不清是我们打印的还是 git 打的。
    const stdout = exec("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, stdout: String(stdout).trim(), stderr: "" };
  } catch (e) {
    const err = e && typeof e === "object" ? e : {};
    const stderr = String(err.stderr ?? err.message ?? e ?? "").trim();
    const stdout = String(err.stdout ?? "").trim();
    return { ok: false, stdout, stderr };
  }
}

/**
 * #334 远端 tag 旁证：返回「远端有、本地没有」的 tag 名（升序）。
 *
 * @param {string[]} localTags 本地 `git tag --list v*` 的结果
 * @param {string} remoteRefs `git ls-remote --tags origin` 的 stdout
 *
 * 口径细节：只取 `refs/tags/` 下的 `v*`（与本地 `--list v*` 一致）；附注 tag 会同时出现
 * `refs/tags/vX` 与 `refs/tags/vX^{}` 两行，后者剥掉 `^{}` 后与前者同名（Set 天然去重）。
 */
export function missingLocalTags(localTags, remoteRefs) {
  const local = new Set(localTags);
  const remote = new Set();
  for (const line of String(remoteRefs).split("\n")) {
    const ref = line.trim().split(/\s+/)[1] ?? "";
    if (!ref.startsWith("refs/tags/")) continue;
    const name = ref.slice("refs/tags/".length).replace(/\^\{\}$/, "");
    if (!name.startsWith("v")) continue;
    remote.add(name);
  }
  return [...remote].filter((t) => !local.has(t)).sort();
}

/**
 * 选出 base 与「是否所有 tag 都指向 HEAD」：
 * - `base`：按版本倒序，第一个**不指向 headCommit** 的 tag（发布路径上 HEAD 就是新 tag 的 commit
 *   ⇒ 自动排除它、取到上一个发布；分支上跑则取最新 tag，等价旧 workflow 语义）；null = 没有可用的；
 * - `allAtHead`：所有 tag 都指向 HEAD（= 首个发布被 push 时）→ 调用方据此**跳过**而非报错。
 *
 * @param {string[]} tags 倒序 tag 名
 * @param {string} headCommit HEAD 的 commit
 * @param {(tag: string) => string | null} commitOfTag 解析 tag 指向的 commit（失败返回 null）
 * @returns {{ base: string | null, allAtHead: boolean }}
 */
export function chooseBase(tags, headCommit, commitOfTag) {
  let atHead = 0;
  for (const tag of tags) {
    const commit = commitOfTag(tag);
    if (!commit) continue;
    if (commit !== headCommit) return { base: tag, allAtHead: false };
    atHead += 1;
  }
  return { base: null, allAtHead: tags.length > 0 && atHead === tags.length };
}

/** 兼容旧签名：只关心 base 时用这个（内部走 chooseBase，单次遍历） */
export function pickPreviousTag(tags, headCommit, commitOfTag) {
  return chooseBase(tags, headCommit, commitOfTag).base;
}

/**
 * 解析不出 base 时的分类：
 * - `ok`：ref 可解析 → 正常继续校验；
 * - `skip-no-history`：**确实没有更早的发布可比** —— 完整克隆且一个 tag 都没有（真正的首个版本），
 *   或 `allTagsAtHead`（发版触发形态下的首个发布）。这是唯一合法的跳过；
 * - `fail`：其余全部失败 —— git 不可用、**浅克隆里没有 tag（tags 没 fetch 到）**、
 *   无法判断是否浅克隆、**远端还有本地没有的 tag（#334）**、或有更早的 tag 但该 ref 解析不了。
 *   一律显式失败，暴露「没校验」。
 *
 * #334：`remoteTags`（`git ls-remote --tags origin` 的结果）是**跳过的必经旁证** ——
 * 「完整克隆」只保证不是浅克隆，不保证 tags 齐全（`--single-branch` / 部分 fetch 同样列不全）。
 */
export function classifyBaseRef({
  revParse,
  tagList,
  shallow,
  allTagsAtHead = false,
  remoteTags = null,
}) {
  if (revParse.ok) return { action: "ok" };

  if (!tagList.ok) {
    return {
      action: "fail",
      reason: `git 不可用（rev-parse 与 tag --list 均失败）：${tagList.stderr || revParse.stderr || "无 stderr"}`,
    };
  }

  const tags = tagList.stdout.split("\n").filter(Boolean);

  /**
   * #334：跳过的远端旁证。通过 → null；不通过 → 失败原因。
   * 远端不可达也**保守 fail**：分不清 tag 是否齐全时，「跳过」会把真实违规吞掉。
   */
  const remoteVerdict = () => {
    if (!remoteTags || !remoteTags.ok) {
      return (
        "远端 tag 无法核对（`git ls-remote --tags origin` 失败）⇒ 不能确认本地 tag 是否齐全，" +
        "故不按「首个发布 / 无历史」跳过" +
        (remoteTags && remoteTags.stderr ? `（stderr: ${remoteTags.stderr}）` : "")
      );
    }
    const missing = missingLocalTags(tags, remoteTags.stdout);
    if (missing.length > 0) {
      return (
        `远端还有 ${missing.length} 个本地没有的 tag（${missing.slice(0, 3).join(", ")}` +
        `${missing.length > 3 ? ", …" : ""}）⇒ 本地 tag 列表**不完整**（\`--single-branch\` 克隆或只 fetch 了部分 tag），` +
        "不能按「首个发布 / 无历史」跳过 —— 这会吞掉真实违规（请改用完整克隆，或先 git fetch --tags）"
      );
    }
    return null;
  };

  // #331：发版触发形态下的首个发布 —— 唯一的 tag 就指向 HEAD，没有更早的发布可比。
  // ⚠️ 复核阻塞项：这只在**完整克隆**里才可信。浅克隆（`fetch-depth` 被改小）+ tag push 时，
  // checkout 只会把**触发 tag** 在本地建出来 ⇒ `tag --list` 同样只剩 HEAD 那一个，而上游其实
  // 还有更早的发布 ⇒ 会把**真实的文档违规**吞成 exit 0（同一个 HEAD，浅克隆「跳过」/ 完整克隆「报违规」，
  // 两个相反结论）。故必须与「0 个 tag」走**同一道**前置。
  if (tags.length > 0 && allTagsAtHead) {
    const complete = shallow && shallow.ok && shallow.stdout === "false";
    if (!complete) {
      return {
        action: "fail",
        reason:
          `仓库里 ${tags.length} 个 tag 全部指向 HEAD，但不是完整克隆` +
          `（is-shallow-repository=${shallow && shallow.ok ? shallow.stdout : "未知"}）` +
          " ⇒ tag 列表不可信，不能按「首个发布」跳过（浅克隆请设 fetch-depth: 0）",
      };
    }
    // #334：完整克隆只是必要条件，还要远端旁证「本地 tag 没漏」
    const bad = remoteVerdict();
    if (bad) return { action: "fail", reason: bad };
    return {
      action: "skip-no-history",
      reason: `仓库里 ${tags.length} 个 tag 全部指向 HEAD（${tags.slice(0, 3).join(", ")}）→ 本次是首个发布（完整克隆 + 远端 tag 已核对一致），没有更早的发布可比`,
    };
  }

  if (tags.length > 0) {
    return {
      action: "fail",
      reason:
        `解析不出可比的 base，但仓库里已有 ${tags.length} 个 tag（示例：${tags.slice(-3).join(", ")}）` +
        " —— 请检查 tag 是否已 fetch、CI 的 fetch-depth 是否为 0（手动指定范围时再检查 --base 取值）",
    };
  }

  // 0 个 tag：必须再区分「真的没有历史」与「tag 没被 fetch」
  if (!shallow || !shallow.ok) {
    return {
      action: "fail",
      reason:
        "仓库没有任何 tag，且无法判断是否为浅克隆（git rev-parse --is-shallow-repository 失败）" +
        " —— 保守失败：请确认 tag 是否已 fetch、fetch-depth 是否为 0",
    };
  }
  if (shallow.stdout === "true") {
    return {
      action: "fail",
      reason:
        "仓库是**浅克隆**（is-shallow-repository=true）且没有任何 tag ⇒ tags 很可能没被 fetch，" +
        "不能按「首个版本」跳过（浅克隆请设 fetch-depth: 0）",
    };
  }
  // #334：0 个 tag 同理 —— 远端若确实有 tag，说明是本地没 fetch，不能跳过
  const bad = remoteVerdict();
  if (bad) return { action: "fail", reason: bad };
  return {
    action: "skip-no-history",
    reason: "仓库尚无任何 tag（完整克隆 + 远端 tag 已核对一致，确系首个版本）",
  };
}
