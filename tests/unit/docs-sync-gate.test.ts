// #302：发布门禁「不许把『没校验』伪装成『校验通过』」—— 对 base ref 失败的四种形态打负例。
// 真实调用在 scripts/check-docs-updated.mjs（CI release-guard 步骤）。
import { describe, expect, it } from "vitest";
import {
  chooseBase,
  classifyBaseRef,
  pickPreviousTag,
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

  it("git 可用、完整克隆且仓库一个 tag 都没有（真正的首个版本）→ 唯一合法的跳过", () => {
    const v = classifyBaseRef({
      revParse: FAIL("unknown revision or path not in the working tree"),
      tagList: { ok: true, stdout: "", stderr: "" },
      shallow: { ok: true, stdout: "false", stderr: "" },
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

describe("#302 复核阻塞项：0 个 tag 不再自动等于「首个版本」（浅克隆信号）", () => {
  const NO_TAGS = { ok: true, stdout: "", stderr: "" };
  const NO_REF = { ok: false, stdout: "", stderr: "unknown revision" };

  it("浅克隆（is-shallow-repository=true）且无 tag → fail：tags 很可能没 fetch 到", () => {
    const v = classifyBaseRef({
      revParse: NO_REF,
      tagList: NO_TAGS,
      shallow: { ok: true, stdout: "true", stderr: "" },
    });
    expect(v.action).toBe("fail");
    expect(v.reason).toContain("浅克隆");
    expect(v.reason).toContain("fetch-depth");
  });

  it("无法判断是否浅克隆（命令失败）→ fail（保守：分不清就不跳过）", () => {
    const v = classifyBaseRef({
      revParse: NO_REF,
      tagList: NO_TAGS,
      shallow: { ok: false, stdout: "", stderr: "boom" },
    });
    expect(v.action).toBe("fail");
    expect(v.reason).toContain("无法判断是否为浅克隆");
  });
});

describe("#302 复核阻塞项：上一个 tag 由脚本自选（判据不再落在 workflow 的 bash）", () => {
  const commits: Record<string, string> = { "v3.3.0": "c33", "v3.4.0": "c34", "v3.5.0": "c35" };
  const commitOfTag = (t: string) => commits[t] ?? null;

  it("发布路径：HEAD 就是新 tag 的 commit → 自动排除它，取上一个 tag", () => {
    expect(pickPreviousTag(["v3.5.0", "v3.4.0", "v3.3.0"], "c35", commitOfTag)).toBe("v3.4.0");
  });

  it("分支上手动跑：HEAD 不等于任何 tag → 取最新 tag", () => {
    expect(pickPreviousTag(["v3.5.0", "v3.4.0"], "cDEV", commitOfTag)).toBe("v3.5.0");
  });

  it("全部 tag 都指向 HEAD，或 tag 解析失败 → null（交给分类器报 fail / 跳过）", () => {
    expect(pickPreviousTag(["v3.5.0"], "c35", commitOfTag)).toBeNull();
    expect(pickPreviousTag(["v9.9.9"], "cDEV", commitOfTag)).toBeNull();
    expect(pickPreviousTag([], "cDEV", commitOfTag)).toBeNull();
  });
});

describe("#331 发版触发形态：首个发布（tag 就是 HEAD）必须**跳过**，不能误判 fail", () => {
  const firstRelease: Record<string, string> = { "v1.0.0": "c1" };
  const withPrev: Record<string, string> = { "v1.1.0": "c2", "v1.0.0": "c1" };

  it("chooseBase：全部 tag 指向 HEAD → base=null 且 allAtHead=true", () => {
    expect(chooseBase(["v1.0.0"], "c1", (t: string) => firstRelease[t] ?? null)).toEqual({
      base: null,
      allAtHead: true,
    });
  });

  it("chooseBase：存在更早的 tag → base=它，allAtHead=false", () => {
    expect(chooseBase(["v1.1.0", "v1.0.0"], "c2", (t: string) => withPrev[t] ?? null)).toEqual({
      base: "v1.0.0",
      allAtHead: false,
    });
  });

  it("chooseBase：一个 tag 都没有 → base=null、allAtHead=false（交给浅克隆判据）", () => {
    expect(chooseBase([], "c1", () => null)).toEqual({ base: null, allAtHead: false });
  });

  it("classifyBaseRef：完整克隆 + allTagsAtHead → skip-no-history，原因写明是「首个发布」", () => {
    const v = classifyBaseRef({
      revParse: { ok: false, stdout: "", stderr: "没有可用的 base tag" },
      tagList: { ok: true, stdout: "v1.0.0", stderr: "" },
      shallow: { ok: true, stdout: "false", stderr: "" },
      allTagsAtHead: true,
    });
    expect(v.action).toBe("skip-no-history");
    expect(v.reason).toContain("首个发布");
    expect(v.reason).toContain("完整克隆");
  });

  // 复核阻塞项：浅克隆下 tag 列表不可信（checkout 只建触发 tag），不能按「首个发布」跳过，
  // 否则会吞掉真实的文档违规（同一 HEAD 在完整克隆里会 exit 1）。
  it("classifyBaseRef：**浅克隆** + allTagsAtHead → fail（tag 列表不可信，不许跳过）", () => {
    const v = classifyBaseRef({
      revParse: { ok: false, stdout: "", stderr: "没有可用的 base tag" },
      tagList: { ok: true, stdout: "v2.0.0", stderr: "" },
      shallow: { ok: true, stdout: "true", stderr: "" },
      allTagsAtHead: true,
    });
    expect(v.action).toBe("fail");
    expect(v.reason).toContain("不是完整克隆");
    expect(v.reason).toContain("fetch-depth");
  });

  it("classifyBaseRef：无法判断是否浅克隆 + allTagsAtHead → fail（分不清就不跳过）", () => {
    const v = classifyBaseRef({
      revParse: { ok: false, stdout: "", stderr: "没有可用的 base tag" },
      tagList: { ok: true, stdout: "v2.0.0", stderr: "" },
      shallow: { ok: false, stdout: "", stderr: "boom" },
      allTagsAtHead: true,
    });
    expect(v.action).toBe("fail");
    expect(v.reason).toContain("未知");
  });

  it("classifyBaseRef：有 tag 但**不是**全指向 HEAD → 仍 fail（提示不再把真因说成首个版本）", () => {
    const v = classifyBaseRef({
      revParse: { ok: false, stdout: "", stderr: "unknown revision" },
      tagList: { ok: true, stdout: "v1.0.0\nv1.1.0", stderr: "" },
      shallow: { ok: true, stdout: "false", stderr: "" },
      allTagsAtHead: false,
    });
    expect(v.action).toBe("fail");
    expect(v.reason).toContain("fetch-depth");
    expect(v.reason).toContain("2 个 tag");
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
