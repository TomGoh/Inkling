/**
 * #302：文档同步门禁的**判据**（与脚本分离，便于对失败形态打负例）。
 *
 * 原则（对齐 CONTRIBUTING 的「不许『没比』伪装成『没回归』」）：
 * **「没校验」不许伪装成「校验通过」**。原实现把 `execFileSync` 的所有异常都当成
 * 「base ref 不可解析（如首次发版）」→ 打印一句「跳过」并 `exit 0`，
 * 于是 git 子进程起不来（沙箱 EBUSY、runner 上 git 异常、fetch-depth 被改小导致 tag 没拉下来）
 * 这类基础设施故障会让发布门禁**静默通过**。
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
 * base ref 解析失败时的分类：
 * - `ok`：ref 可解析 → 正常继续校验；
 * - `skip-no-history`：git 可用、且 `git tag --list` 返回**零个 tag**（真正的首个版本）→ 唯一合法的跳过；
 * - `fail`：其余全部失败 —— git 起不来（两条命令都失败），或**仓库里有 tag 但这个 ref 不存在**
 *   （参数写错 / tag 没 fetch 到 / fetch-depth 不是 0）→ 必须显式失败。
 */
export function classifyBaseRef({ revParse, tagList }) {
  if (revParse.ok) return { action: "ok" };

  if (!tagList.ok) {
    return {
      action: "fail",
      reason: `git 不可用（rev-parse 与 tag --list 均失败）：${tagList.stderr || revParse.stderr || "无 stderr"}`,
    };
  }

  const tags = tagList.stdout.split("\n").filter(Boolean);
  if (tags.length === 0) return { action: "skip-no-history" };

  return {
    action: "fail",
    reason:
      `base ref 不存在，但仓库里已有 ${tags.length} 个 tag（示例：${tags.slice(-3).join(", ")}）` +
      " —— 请检查 --base 取值、tag 是否已 fetch、CI 的 fetch-depth 是否为 0",
  };
}
