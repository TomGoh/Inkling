// #153 DeletedSnapshots 事件驱动刷新测试
//
// 背景：组件原先挂载即每 2 秒把全部快照 JSON.stringify 后整段写回
// localStorage（即使列表为空），造成主线程周期性卡顿。
//
// 验证：
// - 挂载后不再注册任何轮询定时器（空列表也不轮询）
// - 同窗口内写入快照经 SNAPSHOTS_CHANGED_EVENT 即时刷新到 UI
// - 其他窗口写入经原生 storage 事件刷新到 UI
// - 健康探测只写 1 字节哨兵键，不再重写整个快照列表

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { DeletedSnapshots } from "../../src/components/Sidebar/DeletedSnapshots";
import {
  DELETED_FILE_SNAPSHOTS_KEY,
  persistDeletedSnapshot,
  probeSnapshotStorageHealth,
} from "../../src/store/workspace/shared";

vi.mock("../../src/lib/dialogs", () => ({
  askConfirmation: vi.fn(),
  showMessage: vi.fn(),
}));

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("#153 DeletedSnapshots 改为事件驱动刷新", () => {
  it("挂载后不注册任何轮询定时器（空列表也不轮询）", () => {
    const intervalSpy = vi.spyOn(window, "setInterval");

    render(<DeletedSnapshots />);

    expect(intervalSpy).not.toHaveBeenCalled();
    cleanup();
  });

  it("同窗口写入快照后经变更事件即时出现在列表中", async () => {
    const { container } = render(<DeletedSnapshots />);
    expect(container.textContent).toBe(""); // 空列表时组件不渲染内容

    await act(async () => {
      persistDeletedSnapshot("/notes/draft.md", "# 未保存的正文");
    });

    expect(screen.getByText("可恢复文件 (1)")).toBeInTheDocument();
    expect(screen.getByText("draft.md")).toBeInTheDocument();
    cleanup();
  });

  it("其他窗口写入快照后经 storage 事件即时出现在列表中", async () => {
    const { container } = render(<DeletedSnapshots />);
    expect(container.textContent).toBe("");

    const fromOther = JSON.stringify([
      { path: "/notes/other.md", content: "来自另一窗口", deletedAt: Date.now() },
    ]);
    await act(async () => {
      localStorage.setItem(DELETED_FILE_SNAPSHOTS_KEY, fromOther);
      window.dispatchEvent(
        new StorageEvent("storage", { key: DELETED_FILE_SNAPSHOTS_KEY, newValue: fromOther }),
      );
    });

    expect(screen.getByText("可恢复文件 (1)")).toBeInTheDocument();
    expect(screen.getByText("other.md")).toBeInTheDocument();
    cleanup();
  });

  it("无关 key 的 storage 事件不触发快照列表变化", async () => {
    await act(async () => {
      persistDeletedSnapshot("/notes/a.md", "x");
    });
    const { container } = render(<DeletedSnapshots />);
    const before = container.textContent;

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: "inkling-theme", newValue: "dark" }),
      );
    });

    expect(container.textContent).toBe(before);
    cleanup();
  });
});

describe("#153 probeSnapshotStorageHealth 不再重写快照内容", () => {
  it("探测只写哨兵键，不对快照列表做任何 setItem（数 MB 内容免于重复序列化）", () => {
    const bigContent = "x".repeat(64 * 1024); // 模拟较大快照内容
    expect(persistDeletedSnapshot("/notes/big.md", bigContent)).toBe(true);

    const setItemSpy = vi.spyOn(window.localStorage, "setItem");
    const health = probeSnapshotStorageHealth();

    expect(health.writable).toBe(true);
    expect(health.entryCount).toBe(1);
    expect(health.sizeChars).toBeGreaterThan(bigContent.length);
    // 关键断言：探测过程不得重写快照键（原实现会 JSON.stringify 整个列表写回）
    const writtenKeys = setItemSpy.mock.calls.map(([key]) => key);
    expect(writtenKeys).not.toContain(DELETED_FILE_SNAPSHOTS_KEY);
    expect(writtenKeys).toEqual(["inkling-deleted-snapshots-health-probe"]);
    // 哨兵键探测后即清理，不残留
    expect(localStorage.getItem("inkling-deleted-snapshots-health-probe")).toBeNull();
  });

  it("配额耗尽时探测返回 writable:false 且不抛出", () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError", "QuotaExceededError");
    });

    const health = probeSnapshotStorageHealth();
    expect(health.writable).toBe(false);
  });
});
