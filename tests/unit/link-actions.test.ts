// #298 链接动作分派：四臂 + workspace-file 的显式 no-op
//
// `workspace-file` 的用例名刻意写成「PR-2 阶段只分类、不执行」——
// #296 落地打开臂时，这里必须**反转**为「必须打开」，反转点即此文件。

import { describe, it, expect, vi } from "vitest";
import {
  performLinkAction,
  UNSUPPORTED_MESSAGES,
  type LinkActionDeps,
} from "../../src/components/Editor/link-actions";
import type { LinkClassification, UnsupportedReason } from "../../src/lib/link-target";

function makeDeps(overrides: Partial<LinkActionDeps> = {}): LinkActionDeps {
  return {
    openExternal: vi.fn().mockResolvedValue(undefined),
    scrollToAnchor: vi.fn().mockReturnValue(true),
    notify: vi.fn(),
    ...overrides,
  };
}

describe("#298 performLinkAction", () => {
  it("external：openExternal 恰调用一次，参数为原始 URL", () => {
    const deps = makeDeps();
    performLinkAction({ kind: "external", url: "https://example.com/a?b=1" }, deps);

    expect(deps.openExternal).toHaveBeenCalledTimes(1);
    expect(deps.openExternal).toHaveBeenCalledWith("https://example.com/a?b=1");
    expect(deps.scrollToAnchor).not.toHaveBeenCalled();
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it("anchor 命中：scrollToAnchor 收到片段，且不提示", () => {
    const deps = makeDeps();
    performLinkAction({ kind: "anchor", fragment: "理解问题与方法" }, deps);

    expect(deps.scrollToAnchor).toHaveBeenCalledTimes(1);
    expect(deps.scrollToAnchor).toHaveBeenCalledWith("理解问题与方法");
    expect(deps.notify).not.toHaveBeenCalled();
    expect(deps.openExternal).not.toHaveBeenCalled();
  });

  it("anchor 未命中：只调用一次 scrollToAnchor，静默（不提示）", () => {
    const deps = makeDeps({ scrollToAnchor: vi.fn().mockReturnValue(false) });
    performLinkAction({ kind: "anchor", fragment: "不存在的锚点" }, deps);

    expect(deps.scrollToAnchor).toHaveBeenCalledWith("不存在的锚点");
    expect(deps.notify).not.toHaveBeenCalled();
  });

  const reasons: UnsupportedReason[] = [
    "local-file",
    "blocked-scheme",
    "outside-workspace",
    "not-markdown",
    "no-workspace",
    "no-workspace-root",
  ];

  it.each(reasons)("unsupported（%s）：提示固定文案，且不打开任何东西", (reason) => {
    const deps = makeDeps();
    const cls: LinkClassification = { kind: "unsupported", reason, raw: "x" };
    performLinkAction(cls, deps);

    expect(deps.notify).toHaveBeenCalledTimes(1);
    expect(deps.notify).toHaveBeenCalledWith(UNSUPPORTED_MESSAGES[reason], "warning");
    expect(deps.openExternal).not.toHaveBeenCalled();
    expect(deps.scrollToAnchor).not.toHaveBeenCalled();
  });

  it("empty：没有任何动作", () => {
    const deps = makeDeps();
    performLinkAction({ kind: "empty" }, deps);

    expect(deps.openExternal).not.toHaveBeenCalled();
    expect(deps.scrollToAnchor).not.toHaveBeenCalled();
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it("workspace-file：PR-2 阶段只分类、不执行（#296 反转此断言）", () => {
    const deps = makeDeps();
    performLinkAction(
      { kind: "workspace-file", path: "/ws/docs/b.md", fragment: "小节" },
      deps,
    );

    // 打开动作属于 #296；本批次既不能打开、也不能提示——否则会与编辑器自身行为抢注
    expect(deps.openExternal).not.toHaveBeenCalled();
    expect(deps.scrollToAnchor).not.toHaveBeenCalled();
    expect(deps.notify).not.toHaveBeenCalled();
  });
});
