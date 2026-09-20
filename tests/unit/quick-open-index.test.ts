// Quick Open 索引缓存层单测（#228）
//
// mock 策略：vi.mock 工厂里用 **hoisted 普通闭包**记录调用并可注入实现。
// 不用 vi.fn —— tests/setup.ts 的 afterEach 会 vi.restoreAllMocks()，
// 会把工厂里 mockImplementation 的实现抹掉（第二个用例起返回 undefined）。

import { beforeEach, describe, expect, it, vi } from "vitest";

interface IndexPayload {
  files: string[];
  truncated: boolean;
}

const mock = vi.hoisted(() => {
  const state = {
    /** 每次调用的入参 root，用于断言「发了几次、发给谁」 */
    roots: [] as string[],
    /** true 时把 promise 挂起，由测试手动落定（用于并发 / 乱序场景） */
    useDeferred: false,
    deferred: [] as Array<{
      root: string;
      resolve: (value: IndexPayload) => void;
      reject: (error: unknown) => void;
    }>,
    impl: (_root: string): Promise<IndexPayload> =>
      Promise.resolve({ files: [], truncated: false }),
  };
  return state;
});

vi.mock("../../src/lib/fs", () => ({
  listWorkspaceFiles: (root: string) => {
    mock.roots.push(root);
    if (mock.useDeferred) {
      return new Promise<IndexPayload>((resolve, reject) => {
        mock.deferred.push({ root, resolve, reject });
      });
    }
    return mock.impl(root);
  },
}));

import {
  INDEX_TTL_MS,
  __resetWorkspaceIndexForTests,
  collectSingleFileCandidates,
  invalidateWorkspaceIndex,
  loadCandidates,
  type CandidateSource,
} from "../../src/lib/workspaceIndex";

function folderSource(rootPath: string): CandidateSource {
  return { rootPath, workspaceMode: "folder", tabPaths: [], recentFiles: [] };
}

const at = (ms: number) => () => ms;

describe("workspaceIndex（索引缓存与失效）", () => {
  beforeEach(() => {
    __resetWorkspaceIndexForTests();
    mock.roots = [];
    mock.useDeferred = false;
    mock.deferred = [];
    mock.impl = () => Promise.resolve({ files: [], truncated: false });
  });

  it("懒构建：同一工作区连续两次读取只发起一次遍历", async () => {
    mock.impl = () => Promise.resolve({ files: ["/w/a.md", "/w/b.md"], truncated: false });

    const first = await loadCandidates(folderSource("/w"), at(0));
    const second = await loadCandidates(folderSource("/w"), at(1000));

    expect(mock.roots).toEqual(["/w"]);
    expect(first.files).toEqual(["/w/a.md", "/w/b.md"]);
    expect(second.files).toEqual(["/w/a.md", "/w/b.md"]);
    expect(second.stale).toBe(false);
    expect(second.refresh).toBeNull();
  });

  it("工作区切换：换 root 必然重建，不会复用上一个工作区的结果", async () => {
    mock.impl = (root) =>
      Promise.resolve({ files: [`${root}/only.md`], truncated: false });

    await loadCandidates(folderSource("/w1"), at(0));
    const second = await loadCandidates(folderSource("/w2"), at(1));

    expect(mock.roots).toEqual(["/w1", "/w2"]);
    expect(second.files).toEqual(["/w2/only.md"]);
  });

  it("失效：invalidateWorkspaceIndex 之后必须重建（文件树刷新 / 文件增删改的入口）", async () => {
    await loadCandidates(folderSource("/w"), at(0));
    invalidateWorkspaceIndex();
    await loadCandidates(folderSource("/w"), at(1));

    expect(mock.roots).toEqual(["/w", "/w"]);
  });

  it("失效（在途窗口）：冷启动遍历期间失效，迟到的响应不得被当成新鲜数据回写缓存", async () => {
    mock.useDeferred = true;

    const pending = loadCandidates(folderSource("/w"), at(0));
    expect(mock.roots).toEqual(["/w"]);

    // 遍历在途期间：文件被重命名 / 删除 / 文件树刷新
    invalidateWorkspaceIndex();

    // 落定的这份结果是失效**之前**扫的盘
    mock.deferred[0].resolve({ files: ["/w/OLD.md"], truncated: false });
    const snapshot = await pending;

    expect(snapshot.stale).toBe(true);
    expect(snapshot.refresh).not.toBeNull();
    // 必须补一次重建，否则 TTL 内一直读到重命名前的旧清单
    expect(mock.roots).toEqual(["/w", "/w"]);

    mock.deferred[1].resolve({ files: ["/w/NEW.md"], truncated: false });
    const fresh = await snapshot.refresh!;
    expect(fresh.files).toEqual(["/w/NEW.md"]);
    expect(fresh.stale).toBe(false);

    // 新结果已落缓存：紧接着的读取不再遍历
    await loadCandidates(folderSource("/w"), at(1));
    expect(mock.roots).toEqual(["/w", "/w"]);
  });

  it("在途失效 + 切换工作区：不得为已离开的工作区补重建，当前工作区的结果仍要落缓存", async () => {
    mock.useDeferred = true;

    const first = loadCandidates(folderSource("/w1"), at(0)); // /w1 在途（世代 0）
    invalidateWorkspaceIndex(); // 失效发生在 /w1 在途期间

    // 用户随后切到 /w2：这次构建捕获的是**新**世代，结果本身是新鲜的
    const second = loadCandidates(folderSource("/w2"), at(0));
    expect(mock.roots).toEqual(["/w1", "/w2"]);

    // /w1 的响应落定，此时用户已经不在该工作区
    mock.deferred[0].resolve({ files: ["/w1/OLD.md"], truncated: false });
    await first;
    // 不得为已离开的工作区白扫一遍（补重建还会把 latestRoot 拉回 /w1）
    expect(mock.roots).toEqual(["/w1", "/w2"]);

    // /w2 随后落定
    mock.deferred[1].resolve({ files: ["/w2/NEW.md"], truncated: false });
    const w2 = await second;
    expect(w2.files).toEqual(["/w2/NEW.md"]);
    expect(w2.stale).toBe(false);

    // 若 latestRoot 被旧 root 拉回，/w2 的结果会被误判为「已切走」而不写缓存：
    // 这里再读一次即可暴露——缓存命中时不该有第 3 次遍历，且应命中 /w2 自己的清单
    mock.useDeferred = false;
    mock.impl = () => Promise.resolve({ files: ["/w2/FRESH.md"], truncated: false });
    const again = await loadCandidates(folderSource("/w2"), at(1));
    expect(mock.roots).toEqual(["/w1", "/w2"]);
    expect(again.files).toEqual(["/w2/NEW.md"]);
  });

  it("失效补重建失败时不产生未处理拒绝（复审场景 G）", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      mock.useDeferred = true;
      const pending = loadCandidates(folderSource("/w"), at(0)); // 冷启动在途
      invalidateWorkspaceIndex(); // 期间失效（c9 起冷启动也会产出 refresh）

      mock.deferred[0].resolve({ files: ["/w/OLD.md"], truncated: false });
      const snapshot = await pending;
      expect(snapshot.stale).toBe(true);
      expect(snapshot.refresh).not.toBeNull();

      // 调用方不消费 refresh（面板已卸载 / 切换工作区），且这次补重建失败
      mock.deferred[1].reject(new Error("工作区不存在: /w"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setImmediate(resolve));

      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("失效（在途窗口）：TTL 重建期间失效，重建结果不得以新的 builtAt 冒充新鲜数据", async () => {
    mock.impl = () => Promise.resolve({ files: ["/w/OLD.md"], truncated: false });
    // 建立缓存（builtAt = 0）
    await loadCandidates(folderSource("/w"), at(0));

    // TTL 过期 → 后台重建，且让它停在途中
    mock.useDeferred = true;
    const stale = await loadCandidates(folderSource("/w"), at(INDEX_TTL_MS + 1));
    expect(stale.stale).toBe(true);
    expect(mock.roots).toEqual(["/w", "/w"]);

    // 重建在途期间失效
    invalidateWorkspaceIndex();

    mock.deferred[0].resolve({ files: ["/w/OLD.md"], truncated: false });
    const rebuilt = await stale.refresh!;

    // 关键：若把它当新鲜数据写回，TTL 时钟会被重置、面板连「这是旧的」都无从判断
    expect(rebuilt.stale).toBe(true);
    expect(mock.roots).toEqual(["/w", "/w", "/w"]);

    mock.deferred[1].resolve({ files: ["/w/NEW.md"], truncated: false });
    const fresh = await rebuilt.refresh!;
    expect(fresh.files).toEqual(["/w/NEW.md"]);
    expect(fresh.stale).toBe(false);

    // 重建已落缓存，且 builtAt 是这一次的
    await loadCandidates(folderSource("/w"), at(INDEX_TTL_MS + 2));
    expect(mock.roots).toEqual(["/w", "/w", "/w"]);
  });

  it("TTL 内复用缓存，不重复遍历", async () => {
    await loadCandidates(folderSource("/w"), at(0));
    await loadCandidates(folderSource("/w"), at(INDEX_TTL_MS - 1));

    expect(mock.roots).toEqual(["/w"]);
  });

  it("TTL 过期：先返回旧结果渲染，后台重建完成后可替换", async () => {
    let call = 0;
    mock.impl = () => {
      call += 1;
      return Promise.resolve({
        files: call === 1 ? ["/w/old.md"] : ["/w/old.md", "/w/new.md"],
        truncated: false,
      });
    };

    await loadCandidates(folderSource("/w"), at(0));
    const stale = await loadCandidates(folderSource("/w"), at(INDEX_TTL_MS + 1));

    // 关键：过期缓存不得让面板出现「空面板等待」
    expect(stale.files).toEqual(["/w/old.md"]);
    expect(stale.stale).toBe(true);
    expect(stale.refresh).not.toBeNull();

    const fresh = await stale.refresh!;
    expect(fresh.files).toEqual(["/w/old.md", "/w/new.md"]);
    expect(fresh.stale).toBe(false);
    // 重建结果已写回缓存：紧接着的读取不再遍历
    await loadCandidates(folderSource("/w"), at(INDEX_TTL_MS + 2));
    expect(mock.roots).toEqual(["/w", "/w"]);
  });

  it("失败降级：构建失败直接 reject，由面板展示错误与重试（不吞错、不缓存）", async () => {
    mock.impl = () => Promise.reject(new Error("工作区不存在: /missing"));

    await expect(loadCandidates(folderSource("/missing"), at(0))).rejects.toThrow(
      "工作区不存在: /missing",
    );

    // 失败不得留下缓存：下次读取要重新尝试
    mock.impl = () => Promise.resolve({ files: ["/missing/x.md"], truncated: false });
    const retry = await loadCandidates(folderSource("/missing"), at(1));
    expect(retry.files).toEqual(["/missing/x.md"]);
    expect(mock.roots).toEqual(["/missing", "/missing"]);
  });

  it("单文件模式：不调用命令，候选集 = 已打开标签页 + 最近文件（去重保序）", async () => {
    const source: CandidateSource = {
      rootPath: "/some/dir",
      workspaceMode: "file",
      tabPaths: ["/notes/a.md", "/notes/b.md"],
      recentFiles: ["/notes/b.md", "/notes/c.md"],
    };

    const snapshot = await loadCandidates(source, at(0));

    expect(mock.roots).toEqual([]);
    expect(snapshot.files).toEqual(["/notes/a.md", "/notes/b.md", "/notes/c.md"]);
    expect(snapshot.stale).toBe(false);
  });

  it("未打开任何工作区时同样不发命令", async () => {
    const snapshot = await loadCandidates(
      { rootPath: null, workspaceMode: null, tabPaths: [], recentFiles: ["/r/only.md"] },
      at(0),
    );

    expect(mock.roots).toEqual([]);
    expect(snapshot.files).toEqual(["/r/only.md"]);
  });

  it("乱序落定：迟到的旧 root 响应不得覆盖新 root 的缓存", async () => {
    mock.useDeferred = true;

    const firstLoad = loadCandidates(folderSource("/w1"), at(0));
    const secondLoad = loadCandidates(folderSource("/w2"), at(0));
    expect(mock.roots).toEqual(["/w1", "/w2"]);

    // 新 root 先落定，旧 root 后落定
    mock.deferred[1].resolve({ files: ["/w2/a.md"], truncated: false });
    await secondLoad;
    mock.deferred[0].resolve({ files: ["/w1/a.md"], truncated: false });
    await firstLoad;

    // /w2 的缓存必须仍然有效：TTL 内再读不应触发第三次遍历
    const again = await loadCandidates(folderSource("/w2"), at(1000));
    expect(mock.roots).toEqual(["/w1", "/w2"]);
    expect(again.files).toEqual(["/w2/a.md"]);
  });

  it("同 root 的并发读取合并为一次遍历", async () => {
    mock.useDeferred = true;

    const a = loadCandidates(folderSource("/w"), at(0));
    const b = loadCandidates(folderSource("/w"), at(0));
    mock.deferred[0].resolve({ files: ["/w/a.md"], truncated: false });

    expect((await a).files).toEqual(["/w/a.md"]);
    expect((await b).files).toEqual(["/w/a.md"]);
    expect(mock.roots).toEqual(["/w"]);
  });

  it("truncated 标记透传给调用方（面板据此提示结果不完整）", async () => {
    mock.impl = () => Promise.resolve({ files: ["/w/a.md"], truncated: true });

    const snapshot = await loadCandidates(folderSource("/w"), at(0));
    expect(snapshot.truncated).toBe(true);
  });

  it("collectSingleFileCandidates：先标签页后最近文件，去重且保序", () => {
    expect(
      collectSingleFileCandidates(["/a.md", "/b.md"], ["/b.md", "/c.md", "/a.md"]),
    ).toEqual(["/a.md", "/b.md", "/c.md"]);
    expect(collectSingleFileCandidates([], [])).toEqual([]);
  });
});
