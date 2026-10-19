// #298 链接动作分派：external / anchor / unsupported / empty
// #296 扩展：workspace-file 臂（自链接滚动 / 先登记 pending 再打开 / 失败撤销提示）
//
// 依赖全部注入，这里用真断言检查调用参数与**调用顺序**（登记必须先于打开）。

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
    openWorkspaceFile: vi.fn().mockResolvedValue(undefined),
    requestPendingAnchor: vi.fn(),
    cancelPendingAnchor: vi.fn(),
    selfPath: "/ws/notes/a.md",
    isSamePath: (a: string, b: string) => a === b,
    getOpenError: vi.fn().mockReturnValue(undefined),
    ...overrides,
  };
}

describe("#298 performLinkAction（非 workspace 臂）", () => {
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
    expect(deps.openWorkspaceFile).not.toHaveBeenCalled();
  });
});

describe("#296 performLinkAction（workspace-file 臂）", () => {
  it("非自链接 + 无锚点：打开目标文件，不登记 pending", async () => {
    const deps = makeDeps();
    performLinkAction({ kind: "workspace-file", path: "/ws/docs/b.md", fragment: "" }, deps);

    await vi.waitFor(() => expect(deps.openWorkspaceFile).toHaveBeenCalledTimes(1));
    expect(deps.openWorkspaceFile).toHaveBeenCalledWith("/ws/docs/b.md");
    expect(deps.requestPendingAnchor).not.toHaveBeenCalled();
    expect(deps.scrollToAnchor).not.toHaveBeenCalled();
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it("非自链接 + 锚点：先登记 pending，再打开文件", async () => {
    const deps = makeDeps();
    performLinkAction(
      { kind: "workspace-file", path: "/ws/docs/b.md", fragment: "小节" },
      deps,
    );

    await vi.waitFor(() => expect(deps.openWorkspaceFile).toHaveBeenCalledTimes(1));
    expect(deps.requestPendingAnchor).toHaveBeenCalledWith("/ws/docs/b.md", "小节");
    const requestOrder = (deps.requestPendingAnchor as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    const openOrder = (deps.openWorkspaceFile as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    expect(requestOrder).toBeLessThan(openOrder);
  });

  it("自链接 + 锚点：只滚动本文档，不打开、不登记", () => {
    const deps = makeDeps({ selfPath: "/ws/notes/a.md" });
    performLinkAction(
      { kind: "workspace-file", path: "/ws/notes/a.md", fragment: "相对小节" },
      deps,
    );

    expect(deps.scrollToAnchor).toHaveBeenCalledWith("相对小节");
    expect(deps.openWorkspaceFile).not.toHaveBeenCalled();
    expect(deps.requestPendingAnchor).not.toHaveBeenCalled();
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it("自链接 + 空锚点：无任何动作（不滚动、不打开）", () => {
    const deps = makeDeps();
    performLinkAction({ kind: "workspace-file", path: "/ws/notes/a.md", fragment: "" }, deps);

    expect(deps.scrollToAnchor).not.toHaveBeenCalled();
    expect(deps.openWorkspaceFile).not.toHaveBeenCalled();
  });

  it("分屏语义：selfPath 是分屏文件时，主 tab 文件不算自链接", async () => {
    const deps = makeDeps({
      selfPath: "/ws/split.md",
      isSamePath: (a: string, b: string) => a === b,
    });
    performLinkAction({ kind: "workspace-file", path: "/ws/main.md", fragment: "" }, deps);

    await vi.waitFor(() => expect(deps.openWorkspaceFile).toHaveBeenCalledWith("/ws/main.md"));
    expect(deps.scrollToAnchor).not.toHaveBeenCalled();
  });

  it("打开失败：撤销登记并提示后端原因", async () => {
    const deps = makeDeps({
      openWorkspaceFile: vi.fn().mockRejectedValue(new Error("读取失败")),
      getOpenError: vi.fn().mockReturnValue("文件不存在"),
    });
    performLinkAction(
      { kind: "workspace-file", path: "/ws/nope.md", fragment: "小节" },
      deps,
    );

    await vi.waitFor(() =>
      expect(deps.notify).toHaveBeenCalledWith("无法打开：文件不存在", "warning"),
    );
    expect(deps.cancelPendingAnchor).toHaveBeenCalledWith("/ws/nope.md");
  });

  it("打开失败但未登记锚点：不调用 cancelPendingAnchor", async () => {
    const deps = makeDeps({
      openWorkspaceFile: vi.fn().mockRejectedValue(new Error("读取失败")),
      getOpenError: vi.fn().mockReturnValue("文件不存在"),
    });
    performLinkAction({ kind: "workspace-file", path: "/ws/nope.md", fragment: "" }, deps);

    await vi.waitFor(() => expect(deps.notify).toHaveBeenCalled());
    expect(deps.cancelPendingAnchor).not.toHaveBeenCalled();
  });

  it("打开失败且 store 无错误记录：退回异常 message", async () => {
    const deps = makeDeps({
      openWorkspaceFile: vi.fn().mockRejectedValue(new Error("磁盘错误")),
      getOpenError: vi.fn().mockReturnValue(undefined),
    });
    performLinkAction({ kind: "workspace-file", path: "/ws/x.md", fragment: "" }, deps);

    await vi.waitFor(() =>
      expect(deps.notify).toHaveBeenCalledWith("无法打开：磁盘错误", "warning"),
    );
  });
});
