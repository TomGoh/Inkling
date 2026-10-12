// #302：发布门禁「不许把『没校验』伪装成『校验通过』」—— 对 base ref 失败的四种形态打负例。
// 真实调用在 scripts/check-docs-updated.mjs（CI release-guard 步骤）。
import { describe, expect, it } from "vitest";
import {
  classifyBaseRef,
  runGit,
  // @ts-ignore -- 纯 JS 模块（脚本与单测共用同一实现），不带类型声明
} from "../../scripts/lib/docs-sync.mjs";

const OK = { ok: true, stdout: "abc123", stderr: "" };
const FAIL = (stderr: string) => ({ ok: false, stdout: "", stderr });

describe("#302 文档同步门禁：base ref 失败分类", () => {
  it("ref 可解析 → 正常继续校验（ok）", () => {
    expect(classifyBaseRef({ revParse: OK, tagList: OK }).action).toBe("ok");
  });

  it("git 不可用（rev-parse 与 tag --list 都失败）→ fail，并把 stderr 带出来便于定位", () => {
    const v = classifyBaseRef({ revParse: FAIL("spawnSync EBUSY"), tagList: FAIL("spawnSync EBUSY") });
    expect(v.action).toBe("fail");
    expect(v.reason).toContain("git 不可用");
    expect(v.reason).toContain("EBUSY");
  });

  it("git 可用但仓库一个 tag 都没有（真正的首个版本）→ 唯一合法的跳过", () => {
    const v = classifyBaseRef({
      revParse: FAIL("unknown revision or path not in the working tree"),
      tagList: { ok: true, stdout: "", stderr: "" },
    });
    expect(v.action).toBe("skip-no-history");
  });

  it("有 tag 但该 ref 不存在（参数写错 / tag 未 fetch / fetch-depth 被改小）→ fail", () => {
    const v = classifyBaseRef({
      revParse: FAIL("unknown revision"),
      tagList: { ok: true, stdout: "v1.0.0\nv3.3.0\nv3.4.0", stderr: "" },
    });
    expect(v.action).toBe("fail");
    expect(v.reason).toContain("3 个 tag");
    expect(v.reason).toContain("fetch-depth");
  });
});

describe("#302 runGit：永不抛，把 stderr 原样带出", () => {
  it("失败时返回 ok:false + stderr（而不是把异常抛给调用方）", () => {
    const fake = () => {
      const e = new Error("Command failed") as Error & { stderr?: string };
      e.stderr = "fatal: not a git repository (or any of the parent directories): .git";
      throw e;
    };
    const r = runGit(["--version"], fake as never);
    expect(r.ok).toBe(false);
    expect(r.stderr).toContain("not a git repository");
  });

  it("成功时返回 trim 后的 stdout", () => {
    const r = runGit(["--version"], (() => "git version 2.45.0\n") as never);
    expect(r).toEqual({ ok: true, stdout: "git version 2.45.0", stderr: "" });
  });

  it("异常里没有 stderr 时退回 message（保证 reason 永远非空）", () => {
    const r = runGit(["--version"], (() => {
      throw new Error("boom only message");
    }) as never);
    expect(r.ok).toBe(false);
    expect(r.stderr).toBe("boom only message");
  });
});
