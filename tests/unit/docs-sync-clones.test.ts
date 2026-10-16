// #334：单测层面表达不了「本地 tag 列表是否齐全」，必须**真的建仓库、真的克隆、真的跑门禁脚本**。
//
// 形态（对齐 issue 里的实测表）：
//   origin:  main: c1 → c2 = v2.0.0（c2 **只改 src/**、不更文档 ⇒ 真实文档违规）；
//            另一分支 release/1.x: c1 → c_x = v1.0.1
//   G1 完整克隆（全分支 + tags）        → 选中 v1.0.1 → **exit 1**（报出真实违规）
//   G2 `--single-branch --branch main` → **不是浅克隆**，但本地只有 v2.0.0 ⇒ 修复前会「首个发布跳过」exit 0
//                                        ✗；修复后由远端 tag 旁证拦下 → **exit 1**
//   G4 浅克隆 + 触发 tag（#333 形态）   → exit 1（提示不是完整克隆）
//   G0 另一个 origin：唯一 tag 就是 HEAD，远端也一致 → 完整克隆 → exit 0（合法的「首个发布」跳过）
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const SCRIPT = resolve(process.cwd(), "scripts/check-docs-updated.mjs");
const GIT_ID = ["-c", "user.name=docs-sync-test", "-c", "user.email=docs-sync-test@example.com", "-c", "commit.gpgsign=false"];

function hasGit(): boolean {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function write(cwd: string, rel: string, content: string): void {
  const full = join(cwd, rel);
  mkdirSync(resolve(full, ".."), { recursive: true });
  writeFileSync(full, content, "utf8");
}

/** 跑真门禁脚本；返回退出码与输出（非零退出是**预期结果**之一，不能抛） */
function runGate(cwd: string): { code: number; out: string } {
  try {
    return { code: 0, out: execFileSync("node", [SCRIPT, "--head=HEAD"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? -1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

const enabled = hasGit();
const tmp = mkdtempSync(join(tmpdir(), "inkling-docs-sync-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

/**
 * #347：本文件的用例是「真 init / 真 commit / 真 clone（file://）+ 真 spawn 门禁脚本」，
 * 单个用例动辄几十次 git 进程；默认 `testTimeout` 5s 在 Windows CI 高负载下余量不足，
 * 会间歇判红（main `8f56321` 上 `准备：…` 稳定复现过一次超时，同提交复跑即绿）。
 * 这是**耗时余量**问题、不是断言问题 —— 故只放宽这几个用例的超时，不改断言与流程。
 */
const SLOW_GIT_IO = { timeout: 30_000 } as const;

/**
 * 克隆 URL 一律用 `file://`（而不是裸本地路径）：**裸路径克隆会忽略 `--depth`**
 * （git 打印 “--depth is ignored in local clones”），浅克隆形态就造不出来（实测踩过：
 * G4 那时其实不是浅克隆，是远端旁证把它拦下的）。file:// 走正常传输路径，行为与 CI 一致。
 */
const asUrl = (p: string) => pathToFileURL(p).href;

describe.skipIf(!enabled)("#334 真实克隆形态：完整克隆 / single-branch / 浅克隆 / 首个发布", () => {
  const origin = join(tmp, "origin.git");
  const work = join(tmp, "work");
  const firstOrigin = join(tmp, "first-origin.git");
  const firstWork = join(tmp, "first-work");

  it("准备：origin 上 main(c1→c2=v2.0.0，c2 只改 src/) 与 release/1.x(c_x=v1.0.1)", SLOW_GIT_IO, () => {
    git(tmp, ["init", "--bare", "--initial-branch=main", origin]);
    git(tmp, ["init", "--initial-branch=main", work]);
    write(work, "README.md", "# demo\n");
    write(work, "src/a.ts", "export const a = 1;\n");
    git(work, [...GIT_ID, "add", "-A"]);
    git(work, [...GIT_ID, "commit", "-m", "c1"]);
    git(work, [...GIT_ID, "branch", "release/1.x"]);
    // c2：只改 src/、不更文档 ⇒ 真实文档违规；打 v2.0.0
    write(work, "src/a.ts", "export const a = 2;\n");
    git(work, [...GIT_ID, "add", "-A"]);
    git(work, [...GIT_ID, "commit", "-m", "c2（只改 src，不动文档）"]);
    git(work, [...GIT_ID, "tag", "v2.0.0"]);
    // release/1.x 上的更早发布
    git(work, ["checkout", "release/1.x"]);
    write(work, "CHANGELOG.md", "## 1.0.1\n");
    git(work, [...GIT_ID, "add", "-A"]);
    git(work, [...GIT_ID, "commit", "-m", "c_x"]);
    git(work, [...GIT_ID, "tag", "v1.0.1"]);
    git(work, ["checkout", "main"]);
    git(work, ["remote", "add", "origin", origin]);
    git(work, ["push", "origin", "main", "release/1.x", "--tags"]);
    expect(git(tmp, ["ls-remote", "--tags", origin]).split("\n").filter(Boolean).length).toBe(2);
  });

  it("G1 完整克隆 → 选中 v1.0.1，报出真实违规（exit 1）", SLOW_GIT_IO, () => {
    const full = join(tmp, "full");
    git(tmp, ["clone", asUrl(origin), full]);
    const r = runGate(full);
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain("文档同步校验失败");
    expect(r.out).toContain("v1.0.1");
  });

  // ⚠️ 建模说明（实测得来）：本机 git 的 `clone` **默认会把远端 tag 全取下来**，
  // `--single-branch` / `--depth 1` 都不例外（issue 的表格里 single-branch 只剩 HEAD 那个 tag，
  // 那是别的 git 版本/取法）。所以这里不依赖 clone flag 的副作用，而是**直接构造那个形态**：
  // 本地 tag 不全 + 不是浅克隆 —— 这正是「部分 fetch / 工具改了取法」会产生的状态，#334 要拦的就是它。
  it("G2a 本地 tag 不全（非浅克隆、只有 HEAD 那个 tag）→ 远端旁证拦下，不许按「首个发布」跳过（exit 1）", SLOW_GIT_IO, () => {
    const partial = join(tmp, "partial");
    git(tmp, ["clone", asUrl(origin), partial]);
    git(partial, ["tag", "-d", "v1.0.1"]);
    expect(git(partial, ["rev-parse", "--is-shallow-repository"]).trim()).toBe("false");
    expect(git(partial, ["tag", "--list", "v*"]).split("\n").filter(Boolean)).toEqual(["v2.0.0"]);
    const r = runGate(partial);
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain("不完整");
    expect(r.out).toContain("v1.0.1");
    expect(r.out).toContain("git fetch --tags");
  });

  it("G2b 部分 fetch（本地一个 tag 都没有、非浅克隆）→ 远端旁证拦下（exit 1）", SLOW_GIT_IO, () => {
    const tagsNone = join(tmp, "tags-none");
    git(tmp, ["clone", "--single-branch", "--no-tags", "--branch", "main", asUrl(origin), tagsNone]);
    expect(git(tagsNone, ["rev-parse", "--is-shallow-repository"]).trim()).toBe("false");
    expect(git(tagsNone, ["tag", "--list", "v*"]).trim()).toBe("");
    const r = runGate(tagsNone);
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain("不完整");
  });

  it("G4 浅克隆 + 触发 tag（#333 形态）→ fail，提示不是完整克隆", SLOW_GIT_IO, () => {
    const shallow = join(tmp, "shallow");
    git(tmp, ["clone", "--depth", "1", "--branch", "v2.0.0", asUrl(origin), shallow]);
    // 对齐 actions/checkout 的形态：本地只有触发 tag（浅克隆下通常本就取不到更早的 tag）
    try {
      git(shallow, ["tag", "-d", "v1.0.1"]);
    } catch {
      /* 没取到更早的 tag 才是常态 */
    }
    expect(git(shallow, ["rev-parse", "--is-shallow-repository"]).trim()).toBe("true");
    const r = runGate(shallow);
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain("不是完整克隆");
  });

  it("G0 唯一 tag 就是 HEAD 且远端一致 → 完整克隆下是合法的「首个发布」跳过（exit 0）", SLOW_GIT_IO, () => {
    git(tmp, ["init", "--bare", "--initial-branch=main", firstOrigin]);
    git(tmp, ["init", "--initial-branch=main", firstWork]);
    write(firstWork, "README.md", "# first\n");
    write(firstWork, "src/a.ts", "export const a = 1;\n");
    git(firstWork, [...GIT_ID, "add", "-A"]);
    git(firstWork, [...GIT_ID, "commit", "-m", "c1"]);
    git(firstWork, [...GIT_ID, "tag", "v1.0.0"]);
    git(firstWork, ["remote", "add", "origin", firstOrigin]);
    git(firstWork, ["push", "origin", "main", "--tags"]);
    const clone = join(tmp, "first-clone");
    git(tmp, ["clone", asUrl(firstOrigin), clone]);
    const r = runGate(clone);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain("跳过文档同步校验");
    expect(r.out).toContain("首个发布");
  });
});
