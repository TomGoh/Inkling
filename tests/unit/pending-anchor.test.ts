// #296 「打开文件后滚到锚点」登记表
//
// 锁定四件事：消费一次即删、路径互不干扰、Windows 大小写差异不导致漏消费、
// 容量上限淘汰最早一条（防止打开失败/目标未挂载时无限堆积）。

import { beforeEach, describe, it, expect } from "vitest";
import {
  cancelPendingAnchor,
  consumePendingAnchor,
  requestPendingAnchor,
  __resetPendingAnchors,
} from "../../src/lib/pending-anchor";

describe("#296 pending-anchor", () => {
  beforeEach(() => {
    __resetPendingAnchors();
  });

  it("登记后消费一次即空", () => {
    requestPendingAnchor("/ws/notes/a.md", "小节");
    expect(consumePendingAnchor("/ws/notes/a.md")).toBe("小节");
    expect(consumePendingAnchor("/ws/notes/a.md")).toBeNull();
  });

  it("两个路径互不干扰", () => {
    requestPendingAnchor("/ws/a.md", "A");
    requestPendingAnchor("/ws/b.md", "B");
    expect(consumePendingAnchor("/ws/b.md")).toBe("B");
    expect(consumePendingAnchor("/ws/a.md")).toBe("A");
  });

  it("Windows 大小写与分隔符差异在消费时命中", () => {
    requestPendingAnchor("C:\\ws\\notes\\a.md", "小节");
    expect(consumePendingAnchor("c:/ws/notes/a.md")).toBe("小节");
    // 大小写不同视为同一条，消费后原路径也应已清空
    expect(consumePendingAnchor("C:\\WS\\NOTES\\A.MD")).toBeNull();
  });

  it("POSIX 大小写保持敏感", () => {
    requestPendingAnchor("/ws/A.md", "x");
    expect(consumePendingAnchor("/ws/a.md")).toBeNull();
    expect(consumePendingAnchor("/ws/A.md")).toBe("x");
  });

  it("同一路径重复登记只保留最近一条（Windows 大小写/分隔符视为同一路径）", () => {
    requestPendingAnchor("C:\\ws\\a.md", "旧");
    requestPendingAnchor("c:\\WS\\a.md", "新");
    expect(consumePendingAnchor("C:/ws/A.md")).toBe("新");
    expect(consumePendingAnchor("C:\\ws\\a.md")).toBeNull();
  });

  it("取消后不再消费", () => {
    requestPendingAnchor("/ws/a.md", "小节");
    cancelPendingAnchor("/ws/a.md");
    expect(consumePendingAnchor("/ws/a.md")).toBeNull();
  });

  it("空路径或空片段不登记", () => {
    requestPendingAnchor("", "小节");
    requestPendingAnchor("/ws/a.md", "");
    expect(consumePendingAnchor("/ws/a.md")).toBeNull();
  });

  it("容量上限 8：第 9 条挤掉最早一条", () => {
    for (let i = 0; i < 9; i++) {
      requestPendingAnchor(`/ws/${i}.md`, `f${i}`);
    }
    expect(consumePendingAnchor("/ws/0.md")).toBeNull();
    for (let i = 1; i < 9; i++) {
      expect(consumePendingAnchor(`/ws/${i}.md`)).toBe(`f${i}`);
    }
  });
});
