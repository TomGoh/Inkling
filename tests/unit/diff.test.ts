// 行级 diff 与冲突备份命名单元测试

import { describe, expect, it } from "vitest";
import { diffLines, nextBackupPath } from "../../src/lib/diff";

describe("diffLines", () => {
  it("完全相同的内容返回全 equal", () => {
    const result = diffLines("a\nb\nc", "a\nb\nc");
    expect(result).toEqual([
      { op: "equal", local: "a", disk: "a" },
      { op: "equal", local: "b", disk: "b" },
      { op: "equal", local: "c", disk: "c" },
    ]);
  });

  it("纯新增：磁盘多出行显示为 add", () => {
    const result = diffLines("a\nc", "a\nb\nc");
    expect(result).toEqual([
      { op: "equal", local: "a", disk: "a" },
      { op: "add", local: null, disk: "b" },
      { op: "equal", local: "c", disk: "c" },
    ]);
  });

  it("纯删除：本地独有行显示为 remove", () => {
    const result = diffLines("a\nb\nc", "a\nc");
    expect(result).toEqual([
      { op: "equal", local: "a", disk: "a" },
      { op: "remove", local: "b", disk: null },
      { op: "equal", local: "c", disk: "c" },
    ]);
  });

  it("整行修改拆成 remove + add", () => {
    const result = diffLines("hello", "world");
    expect(result).toEqual([
      { op: "remove", local: "hello", disk: null },
      { op: "add", local: null, disk: "world" },
    ]);
  });

  it("中间修改保留公共前后缀为 equal", () => {
    const result = diffLines(
      "head\nold1\nold2\ntail",
      "head\nnew1\ntail",
    );
    expect(result[0]).toEqual({ op: "equal", local: "head", disk: "head" });
    expect(result.at(-1)).toEqual({ op: "equal", local: "tail", disk: "tail" });
    const ops = result.filter((l) => l.op !== "equal");
    expect(ops).toEqual([
      { op: "remove", local: "old1", disk: null },
      { op: "remove", local: "old2", disk: null },
      { op: "add", local: null, disk: "new1" },
    ]);
  });

  it("一侧为空全部显示为对侧的增删", () => {
    expect(diffLines("x\ny", "")).toEqual([
      { op: "remove", local: "x", disk: null },
      { op: "remove", local: "y", disk: null },
    ]);
    expect(diffLines("", "x")).toEqual([{ op: "add", local: null, disk: "x" }]);
  });

  it("空对空返回空数组", () => {
    expect(diffLines("", "")).toEqual([]);
  });

  it("差异区域超过上限时降级为整块替换（不卡死）", () => {
    const local = Array.from({ length: 3000 }, (_, i) => `l${i}`).join("\n");
    const disk = Array.from({ length: 3000 }, (_, i) => `d${i}`).join("\n");
    const start = Date.now();
    const result = diffLines(local, disk);
    const elapsed = Date.now() - start;
    // 降级路径：无 equal 中间行，remove×3000 + add×3000
    expect(result.filter((l) => l.op === "remove")).toHaveLength(3000);
    expect(result.filter((l) => l.op === "add")).toHaveLength(3000);
    expect(elapsed).toBeLessThan(1000);
  });

  it("大文件仅尾部改动走 LCS 快速路径", () => {
    const head = Array.from({ length: 2000 }, (_, i) => `line${i}`).join("\n");
    const result = diffLines(`${head}\nend-v1`, `${head}\nend-v2`);
    expect(result).toHaveLength(2002); // 2000 equal + 1 remove + 1 add
    expect(result.at(-2)).toEqual({ op: "remove", local: "end-v1", disk: null });
    expect(result.at(-1)).toEqual({ op: "add", local: null, disk: "end-v2" });
  });
});

describe("nextBackupPath", () => {
  it("默认生成 原名.backup.扩展名", () => {
    expect(nextBackupPath("/notes/a.md", new Set())).toBe("/notes/a.backup.md");
  });

  it("已存在时递增编号", () => {
    const existing = new Set(["/notes/a.backup.md"]);
    expect(nextBackupPath("/notes/a.md", existing)).toBe("/notes/a.backup.2.md");
  });

  it("多级占用持续递增", () => {
    const existing = new Set([
      "/notes/a.backup.md",
      "/notes/a.backup.2.md",
      "/notes/a.backup.3.md",
    ]);
    expect(nextBackupPath("/notes/a.md", existing)).toBe("/notes/a.backup.4.md");
  });

  it("大小写不敏感判断占用（Windows 路径）", () => {
    const existing = new Set(["C:\\Docs\\A.backup.MD"]);
    expect(nextBackupPath("C:\\Docs\\A.md", existing)).toBe(
      "C:\\Docs\\A.backup.2.md",
    );
  });

  it("无扩展名文件直接追加 .backup", () => {
    expect(nextBackupPath("/notes/README", new Set())).toBe(
      "/notes/README.backup",
    );
  });
});
