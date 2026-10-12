/**
 * #302：文档同步门禁的**判据**（与脚本分离，便于对失败形态打负例）。
 *
 * 原则（对齐 CONTRIBUTING 的「不许『没比』伪装成『没回归』」）：
 * **「没校验」不许伪装成「校验通过」**。
 *
 * 两条硬约束（PR #329 复核阻塞项）：
 * ① **跳过判定必须落在脚本里**，不能留在 workflow 的 bash 分支 —— 否则脚本的分类器在发布路径上
 *    基本不可达，「没校验」照样以 exit 0 收场；
 * ② **「0 个 tag」不足以判定「首个版本」** —— tag 未 fetch / `fetch-depth` 被改小时，
 *    浅克隆里 `git tag --list` 同样是空。必须用 `--is-shallow-repository` 区分。
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
    // pipe 之后失败信息留在 error.stderr 里，由调用方决定是否打印（见脚本的 fail 分支）。
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
 * 选出「上一个 tag」：`tags` 已按版本号倒序，取**第一个不指向 headCommit 的** tag。
 *
 * 发布路径上 HEAD 就是刚打的 tag 的 commit ⇒ 自动排除它、取到上一个发布；
 * 从分支手动跑时，HEAD 一般不等于任何 tag ⇒ 取到的就是最新 tag（等价旧 workflow 的语义）。
 *
 * @param {string[]} tags 倒序 tag 名
 * @param {string} headCommit HEAD 的 commit
 * @param {(tag: string) => string | null} commitOfTag 解析 tag 指向的 commit（失败返回 null）
 * @returns {string | null} 可作 base 的 tag；null 表示没有可用的
 */
export function pickPreviousTag(tags, headCommit, commitOfTag) {
  for (const tag of tags) {
    const commit = commitOfTag(tag);
    if (commit && commit !== headCommit) return tag;
  }
  return null;
}

/**
 * base ref 解析失败时的分类：
 * - `ok`：ref 可解析 → 正常继续校验；
 * - `skip-no-history`：**完整克隆（非 shallow）且确实一个 tag 都没有**（真正的首个版本）
 *   → 唯一合法的跳过；
 * - `fail`：其余全部失败 —— git 不可用、**浅克隆里没有 tag（tags 没 fetch 到）**、
 *   无法判断是否浅克隆、或有 tag 但该 ref 不存在。一律显式失败，暴露「没校验」。
 */
export function classifyBaseRef({ revParse, tagList, shallow }) {
  if (revParse.ok) return { action: "ok" };

  if (!tagList.ok) {
    return {
      action: "fail",
      reason: `git 不可用（rev-parse 与 tag --list 均失败）：${tagList.stderr || revParse.stderr || "无 stderr"}`,
    };
  }

  const tags = tagList.stdout.split("\n").filter(Boolean);
  if (tags.length > 0) {
    return {
      action: "fail",
      reason:
        `base ref 不存在，但仓库里已有 ${tags.length} 个 tag（示例：${tags.slice(-3).join(", ")}）` +
        " —— 请检查 --base 取值、tag 是否已 fetch、CI 的 fetch-depth 是否为 0",
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
  return { action: "skip-no-history" };
}
