// #165 多窗口间 workspace 持久化同步测试
//
// 背景：settings/theme/shortcuts 已有 storage 事件跨窗口同步，但
// workspace 域的最近文件/书签/展开目录只在启动时读一次、变更时整体覆写，
// 窗口 A 的新条目会被窗口 B 随后的整体覆写抹掉。
//
// 验证：模拟「另一个窗口写入 localStorage」——直接写入存储后派发原生
// StorageEvent（浏览器只在发起窗口之外的窗口触发该事件），断言本窗口
// store 内存状态随真实存储值更新，之后的写回基于合并后的列表。

import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspace } from "../../src/store/workspace";
import {
  BOOKMARKS_KEY,
  EXPANDED_DIRS_KEY,
  RECENT_FILES_KEY,
  persistBookmarks,
  persistRecentFiles,
} from "../../src/store/workspace/shared";

/** 模拟另一窗口写入某 key 后触发的原生 storage 事件 */
function emitStorageFromOtherWindow(key: string, newValue: string | null): void {
  window.dispatchEvent(new StorageEvent("storage", { key, newValue }));
}

beforeEach(() => {
  localStorage.clear();
  useWorkspace.setState({
    recentFiles: [],
    bookmarks: [],
    expandedDirs: new Set<string>(),
  });
});

describe("#165 workspace 持久化的跨窗口 storage 同步", () => {
  it("其他窗口写入最近文件后，本窗口 store 更新为最新列表", () => {
    const fromOther = ["/notes/b.md", "/notes/a.md"];
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(fromOther));
    emitStorageFromOtherWindow(RECENT_FILES_KEY, JSON.stringify(fromOther));

    expect(useWorkspace.getState().recentFiles).toEqual(fromOther);
  });

  it("其他窗口写入书签后，本窗口 store 更新为最新列表", () => {
    const fromOther = ["/notes/starred.md"];
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(fromOther));
    emitStorageFromOtherWindow(BOOKMARKS_KEY, JSON.stringify(fromOther));

    expect(useWorkspace.getState().bookmarks).toEqual(fromOther);
  });

  it("其他窗口写入展开目录后，本窗口 store 更新为最新集合", () => {
    const fromOther = ["/notes", "/notes/sub"];
    localStorage.setItem(EXPANDED_DIRS_KEY, JSON.stringify(fromOther));
    emitStorageFromOtherWindow(EXPANDED_DIRS_KEY, JSON.stringify(fromOther));

    expect(useWorkspace.getState().expandedDirs).toEqual(new Set(fromOther));
  });

  it("先收到他窗口更新再写回时，本窗口写入保留双方条目（不再后写覆盖先写）", () => {
    // 窗口 A 先打开 a.md 并写入
    persistRecentFiles(["/notes/a.md"]);
    // 窗口 B（本窗口）通过 storage 事件收到 A 的更新
    emitStorageFromOtherWindow(RECENT_FILES_KEY, JSON.stringify(["/notes/a.md"]));
    // 本窗口随后打开 b.md：基于已合并的内存列表写回
    const merged = ["/notes/b.md", ...useWorkspace.getState().recentFiles.filter((p) => p !== "/notes/b.md")];
    persistRecentFiles(merged);

    const persisted = JSON.parse(localStorage.getItem(RECENT_FILES_KEY)!) as string[];
    expect(persisted).toContain("/notes/a.md"); // A 的条目未被抹掉
    expect(persisted[0]).toBe("/notes/b.md"); // B 的新条目在最新位置
  });

  it("他窗口写入非法 JSON 时回退为空列表而不是崩溃", () => {
    localStorage.setItem(RECENT_FILES_KEY, "{invalid");
    emitStorageFromOtherWindow(RECENT_FILES_KEY, "{invalid");

    expect(useWorkspace.getState().recentFiles).toEqual([]);
  });

  it("无关 key 的 storage 事件不影响 workspace 状态", () => {
    useWorkspace.setState({ recentFiles: ["/keep.md"] });
    emitStorageFromOtherWindow("inkling-theme", "dark");

    expect(useWorkspace.getState().recentFiles).toEqual(["/keep.md"]);
  });

  it("localStorage.clear()（key 为 null）不抹掉本窗口内存状态", () => {
    useWorkspace.setState({ recentFiles: ["/keep.md"], bookmarks: ["/star.md"] });
    emitStorageFromOtherWindow("", null); // StorageEvent 的 key 为 null 场景
    window.dispatchEvent(new StorageEvent("storage", { key: null }));

    expect(useWorkspace.getState().recentFiles).toEqual(["/keep.md"]);
    expect(useWorkspace.getState().bookmarks).toEqual(["/star.md"]);
  });
});
