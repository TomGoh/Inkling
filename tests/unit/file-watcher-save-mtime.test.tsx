// issue #144：自家自动保存写盘被文件监听误判为外部修改
// 三道防线（A 保存事件登记基线 / B diskMtime 容差兜底 / C 忽略窗内刷新基线）
// 与「真实外部修改仍必须弹窗」的回归断言。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useFileWatcher } from "../../src/lib/useFileWatcher";
import { useWorkspace } from "../../src/store/workspace";
import { useConflict } from "../../src/store/conflict";
import * as fs from "../../src/lib/fs";
import * as dialogs from "../../src/lib/dialogs";
import * as tauriCore from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(),
}));

vi.mock("../../src/lib/fs", () => ({
  fileMtime: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}));

vi.mock("../../src/lib/dialogs", () => ({
  askConfirmation: vi.fn(),
  showMessage: vi.fn(),
}));

const DOC = "/workspace/笔记.md";
/** 首次打开文件时读到的磁盘 mtime（打开时刻） */
const OPEN_MTIME = 1_760_000_000_000;
/** 自动保存写盘后磁盘上的新 mtime：与打开时刻相差 1.6s，远超 5ms 容差 */
const SAVED_MTIME = OPEN_MTIME + 1_600;
/** 外部程序改动后的 mtime：与自家写盘基线相差一分钟，明显不是自家写盘 */
const EXTERNAL_MTIME = SAVED_MTIME + 60_000;
const SAVE_IGNORE_WINDOW = 2000;

/** 让 check() 内部的 await 链全部落地（真实定时器，flush 微任务 + 宏任务） */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const pollOnce = async () => {
  window.dispatchEvent(new Event("focus"));
  await flush();
  await flush();
};

const makeTab = (over: Partial<{ content: string; dirty: boolean; diskMtime?: number }> = {}) => ({
  path: DOC,
  content: over.content ?? "# 标题\n\n正在写的正文",
  dirty: over.dirty ?? false,
  diskMtime: "diskMtime" in over ? over.diskMtime : OPEN_MTIME,
  diskContent: over.content ?? "# 标题\n\n正在写的正文",
  deletedOnDisk: false,
  lastSavedAt: null,
  cursorPos: 12,
  scrollTop: 0,
});

describe("useFileWatcher 自身写盘不应误报外部修改（issue #144）", () => {
  let clock = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tauriCore.isTauri).mockReturnValue(true);
    vi.mocked(dialogs.askConfirmation).mockResolvedValue(false);
    clock = 1_780_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock);

    useWorkspace.setState({
      openTabs: [makeTab()],
      currentFile: DOC,
      currentContent: "# 标题\n\n正在写的正文",
      dirty: false,
      lastSavedAt: null,
    });
    useConflict.setState({ conflict: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const advance = (ms: number) => {
    clock += ms;
  };

  /**
   * 模拟一次自动保存：写盘改变磁盘 mtime，store 登记新基线并推进 lastSavedAt。
   * missingDiskMtime=true 表示写盘后回读 mtime 失败（A、B 都拿不到基线的最坏情况）。
   */
  const simulateAutosave = (
    opts: { diskMtime?: number; missingDiskMtime?: boolean; bumpStoreLastSavedAt?: boolean } = {},
  ) => {
    const { bumpStoreLastSavedAt = true } = opts;
    const diskMtime = opts.missingDiskMtime ? undefined : (opts.diskMtime ?? SAVED_MTIME);
    vi.mocked(fs.fileMtime).mockResolvedValue(SAVED_MTIME);
    const tab = useWorkspace.getState().openTabs[0];
    useWorkspace.setState({
      openTabs: [
        {
          ...tab,
          dirty: false,
          diskMtime,
          diskContent: tab.content,
          lastSavedAt: clock,
        },
      ],
      lastSavedAt: bumpStoreLastSavedAt ? clock : null,
    });
  };

  it("A：自动保存写盘后，忽略窗过期的下一次轮询不再误报（原缺陷复现路径）", async () => {
    // 打开文件时注册基线：磁盘 mtime = OPEN_MTIME
    vi.mocked(fs.fileMtime).mockResolvedValue(OPEN_MTIME);
    const { unmount } = renderHook(() => useFileWatcher());
    await pollOnce();

    // 源码模式连续输入 → 2s 防抖自动保存：磁盘 mtime 变为 SAVED_MTIME
    simulateAutosave();

    // 越过 2s 保存忽略窗后的下一次轮询（缺陷版本的误报就发生在这里）
    advance(SAVE_IGNORE_WINDOW + 1000);
    await pollOnce();

    expect(dialogs.askConfirmation).not.toHaveBeenCalled();
    expect(useConflict.getState().conflict).toBeNull();
    // 内容不应被「重载」打断
    expect(useWorkspace.getState().currentContent).toBe("# 标题\n\n正在写的正文");

    unmount();
  });

  it("B：保存事件未触发订阅（如后台保存）时，靠 tab.diskMtime 容差兜底静默登记基线", async () => {
    vi.mocked(fs.fileMtime).mockResolvedValue(OPEN_MTIME);
    const { unmount } = renderHook(() => useFileWatcher());
    await pollOnce();

    // 写盘已完成且 store 已登记 diskMtime，但 store 级 lastSavedAt 未变化 → A 不命中
    simulateAutosave({ bumpStoreLastSavedAt: false });
    expect(useWorkspace.getState().lastSavedAt).toBeNull();

    await pollOnce();

    expect(dialogs.askConfirmation).not.toHaveBeenCalled();
    expect(useConflict.getState().conflict).toBeNull();

    // 基线已被 B 刷成写盘后的 mtime：后续轮询同样安静
    await pollOnce();
    expect(dialogs.askConfirmation).not.toHaveBeenCalled();

    unmount();
  });

  it("C：写盘后 mtime 读回失败（diskMtime 缺失）时，忽略窗内轮询仍刷新基线，窗后不补弹", async () => {
    vi.mocked(fs.fileMtime).mockResolvedValue(OPEN_MTIME);
    const { unmount } = renderHook(() => useFileWatcher());
    await pollOnce();

    // A、B 都不可用的最坏情况：diskMtime 未登记
    simulateAutosave({ missingDiskMtime: true });
    expect(useWorkspace.getState().openTabs[0].diskMtime).toBeUndefined();

    // 忽略窗内轮询：只刷新基线，不弹窗
    advance(SAVE_IGNORE_WINDOW - 500);
    await pollOnce();
    expect(dialogs.askConfirmation).not.toHaveBeenCalled();

    // 窗口过期后再轮询：基线已是写盘后的 mtime，不再补一次误报
    advance(4000);
    await pollOnce();
    expect(dialogs.askConfirmation).not.toHaveBeenCalled();
    expect(useConflict.getState().conflict).toBeNull();

    unmount();
  });

  it("回归：真实外部修改（mtime 与自家写盘基线不符）仍弹「文件已被外部修改」", async () => {
    vi.mocked(fs.fileMtime).mockResolvedValue(OPEN_MTIME);
    const { unmount } = renderHook(() => useFileWatcher());
    await pollOnce();

    // 外部程序改写文件：mtime 既不等于已知基线，也不等于自家写盘基线
    vi.mocked(fs.fileMtime).mockResolvedValue(EXTERNAL_MTIME);
    await pollOnce();

    expect(dialogs.askConfirmation).toHaveBeenCalledTimes(1);
    expect(dialogs.askConfirmation).toHaveBeenCalledWith(
      expect.stringContaining("已被外部修改"),
      expect.objectContaining({ title: "文件已被外部修改" }),
    );

    unmount();
  });

  it("回归：自家写盘之后又被外部修改，仍能识别并弹冲突对话框（不被兜底逻辑吞掉）", async () => {
    vi.mocked(fs.fileMtime).mockResolvedValue(OPEN_MTIME);
    const openConflictSpy = vi.fn();
    useConflict.setState({ conflict: null, openConflict: openConflictSpy });

    useWorkspace.setState({
      openTabs: [makeTab({ content: "# 标题\n\n本地未保存的改动", dirty: true })],
      currentContent: "# 标题\n\n本地未保存的改动",
      dirty: true,
    });
    const { unmount } = renderHook(() => useFileWatcher());
    await pollOnce();

    // 先自家自动保存（基线刷新为 SAVED_MTIME）
    simulateAutosave();
    advance(SAVE_IGNORE_WINDOW + 1000);
    await pollOnce();
    expect(openConflictSpy).not.toHaveBeenCalled();

    // 随后外部程序改动：mtime 跳到 EXTERNAL_MTIME
    vi.mocked(fs.fileMtime).mockResolvedValue(EXTERNAL_MTIME);
    vi.mocked(fs.readTextFile).mockResolvedValue("# 标题\n\n外部程序写的内容");
    await pollOnce();

    expect(openConflictSpy).toHaveBeenCalledTimes(1);
    expect(openConflictSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: DOC,
        localContent: "# 标题\n\n本地未保存的改动",
        diskContent: "# 标题\n\n外部程序写的内容",
      }),
    );

    unmount();
  });
});
