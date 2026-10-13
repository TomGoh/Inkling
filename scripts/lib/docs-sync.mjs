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
 *   无法判断是否浅克隆、或有更早的 tag 但该 ref 解析不了。一律显式失败，暴露「没校验」。
 */
export function classifyBaseRef({ revParse, tagList, shallow, allTagsAtHead = false }) {
  if (revParse.ok) return { action: "ok" };

  if (!tagList.ok) {
    return {
      action: "fail",
      reason: `git 不可用（rev-parse 与 tag --list 均失败）：${tagList.stderr || revParse.stderr || "无 stderr"}`,
    };
  }

  const tags = tagList.stdout.split("\n").filter(Boolean);

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
    return {
      action: "skip-no-history",
      reason: `仓库里 ${tags.length} 个 tag 全部指向 HEAD（${tags.slice(0, 3).join(", ")}）→ 本次是首个发布（完整克隆，tag 列表可信），没有更早的发布可比`,
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
  return {
    action: "skip-no-history",
    reason: "仓库尚无任何 tag（完整克隆，确系首个版本）",
  };
}
