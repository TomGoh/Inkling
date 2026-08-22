import { describe, it, expect, vi } from "vitest";

let resolveCalls = 0;

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/path", () => ({
  resolve: (...args: string[]) => {
    resolveCalls++;
    return Promise.resolve(`#${resolveCalls}:${args.join("/")}`);
  },
}));

import { resolveImageSrc } from "../../src/lib/fs";

describe("resolveImageSrc 真实缓存命中计数与 LRU 淘汰", () => {
  it("非本地协议直接跳过不调用 resolve", async () => {
    const before = resolveCalls;
    expect(await resolveImageSrc("https://example.com/img.png", "/docs/test.md")).toBe(
      "https://example.com/img.png",
    );
    expect(await resolveImageSrc("data:image/png;base64,123", "/docs/test.md")).toBe(
      "data:image/png;base64,123",
    );
    expect(resolveCalls).toBe(before);
  });

  it("相同参数命中缓存，不重复执行 path.resolve", async () => {
    const keySrc = "assets/unique-cache-target.png";
    const docPath = "/home/user/cache-doc.md";

    const callsBefore = resolveCalls;
    const res1 = await resolveImageSrc(keySrc, docPath);
    expect(resolveCalls).toBe(callsBefore + 1);

    // 第二次调用必须完全命中缓存，resolveCalls 保持不变
    const res2 = await resolveImageSrc(keySrc, docPath);
    expect(res2).toBe(res1);
    expect(resolveCalls).toBe(callsBefore + 1);
  });

  it("超过 500 条上限时淘汰最久未使用的项（LRU 顺序）", async () => {
    const docPath = "/home/user/lru-doc.md";
    // 写入第一个项
    const firstRes = await resolveImageSrc("item-0.png", docPath);

    // 连续插入 500 个不同项，挤出最旧项
    for (let i = 1; i <= 500; i++) {
      await resolveImageSrc(`item-${i}.png`, docPath);
    }

    const callsBefore = resolveCalls;
    // 再次请求 item-0.png 时，应因为已被挤出缓存而重新触发 resolve
    const reFetchedFirst = await resolveImageSrc("item-0.png", docPath);
    expect(resolveCalls).toBe(callsBefore + 1);
    expect(reFetchedFirst).not.toBe(firstRes);
  });
});
