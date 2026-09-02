// #167 侧边栏区块折叠状态持久化 + 低窗口布局防挤没测试
//
// 验证：
// - 最近打开/书签/可恢复文件区块的折叠状态持久化到 inkling-ui，
//   组件重挂载（切换工作区等场景）后保持用户选择而非重置为展开
// - 旧版本持久化数据缺少 sectionExpanded 字段时回退默认（全部展开）
// - Sidebar.css：文件树容器有保底高度、区块允许收缩，
//   三区块合计超过 100% 时不再把文件树压缩到 0

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../../src/lib/dialogs", () => ({
  askConfirmation: vi.fn(),
  showMessage: vi.fn(),
}));

import { RecentFiles } from "../../src/components/Sidebar/RecentFiles";
import { Bookmarks } from "../../src/components/Sidebar/Bookmarks";
import { DeletedSnapshots } from "../../src/components/Sidebar/DeletedSnapshots";
import { useUI, type SidebarSectionExpanded } from "../../src/store/ui";
import { useWorkspace } from "../../src/store/workspace";
import { persistDeletedSnapshot } from "../../src/store/workspace/shared";

const DEFAULT_SECTIONS: SidebarSectionExpanded = {
  recents: true,
  bookmarks: true,
  snapshots: true,
};

beforeEach(() => {
  localStorage.clear();
  useUI.setState({ sectionExpanded: { ...DEFAULT_SECTIONS } });
  useWorkspace.setState({
    recentFiles: ["/notes/a.md"],
    bookmarks: ["/notes/b.md"],
  });
});

describe("#167 区块折叠状态持久化", () => {
  it("最近打开区块折叠后写入 inkling-ui，重挂载保持折叠", () => {
    const first = render(<RecentFiles />);
    fireEvent.click(screen.getByText("最近打开"));
    expect(screen.queryByText("a.md")).not.toBeInTheDocument(); // 已折叠

    const persisted = JSON.parse(localStorage.getItem("inkling-ui")!);
    expect(persisted.sectionExpanded.recents).toBe(false);
    expect(useUI.getState().sectionExpanded.recents).toBe(false);

    first.unmount();
    render(<RecentFiles />); // 重挂载（如切换工作区导致 Sidebar 子树重建）
    expect(screen.queryByText("a.md")).not.toBeInTheDocument(); // 仍保持折叠
    cleanup();
  });

  it("书签区块折叠状态同样持久化并跨挂载保持", () => {
    const first = render(<Bookmarks />);
    fireEvent.click(screen.getByText("书签"));
    expect(screen.queryByText("b.md")).not.toBeInTheDocument();

    const persisted = JSON.parse(localStorage.getItem("inkling-ui")!);
    expect(persisted.sectionExpanded.bookmarks).toBe(false);

    first.unmount();
    render(<Bookmarks />);
    expect(screen.queryByText("b.md")).not.toBeInTheDocument();
    cleanup();
  });

  it("可恢复文件区块折叠状态同样持久化并跨挂载保持", async () => {
    await act(async () => {
      persistDeletedSnapshot("/notes/gone.md", "未保存内容");
    });

    const first = render(<DeletedSnapshots />);
    fireEvent.click(screen.getByText(/可恢复文件/));
    expect(screen.queryByText("gone.md")).not.toBeInTheDocument();

    const persisted = JSON.parse(localStorage.getItem("inkling-ui")!);
    expect(persisted.sectionExpanded.snapshots).toBe(false);

    first.unmount();
    render(<DeletedSnapshots />);
    expect(screen.queryByText("gone.md")).not.toBeInTheDocument();
    cleanup();
  });

  it("折叠一个区块不影响其他区块与既有 UI 偏好的持久化", () => {
    useUI.getState().setSidebarVisible(false); // 先写入一个既有字段
    render(<RecentFiles />);
    fireEvent.click(screen.getByText("最近打开"));

    const persisted = JSON.parse(localStorage.getItem("inkling-ui")!);
    expect(persisted.sidebarVisible).toBe(false); // 既有字段未被覆盖丢失
    expect(persisted.sectionExpanded.recents).toBe(false);
    expect(persisted.sectionExpanded.bookmarks).toBe(true);
    cleanup();
  });

  it("旧版本持久化数据缺少 sectionExpanded 时重新加载回退为全部展开", async () => {
    localStorage.setItem(
      "inkling-ui",
      JSON.stringify({ sidebarVisible: true, outlineVisible: true }),
    );
    vi.resetModules();
    const { useUI: freshUI } = await import("../../src/store/ui");
    expect(freshUI.getState().sectionExpanded).toEqual(DEFAULT_SECTIONS);
    expect(freshUI.getState().sidebarVisible).toBe(true);
  });

  it("sectionExpanded 中非法字段逐项回退默认而不是整体丢弃", async () => {
    localStorage.setItem(
      "inkling-ui",
      JSON.stringify({ sectionExpanded: { recents: false, bookmarks: "yes", snapshots: 1 } }),
    );
    vi.resetModules();
    const { useUI: freshUI } = await import("../../src/store/ui");
    // recents 合法保留；其余非法值回退默认展开
    expect(freshUI.getState().sectionExpanded).toEqual({
      recents: false,
      bookmarks: true,
      snapshots: true,
    });
  });
});

describe("#167 低窗口布局：文件树不被区块挤没", () => {
  const css = readFileSync(
    resolve(__dirname, "../../src/components/Sidebar/Sidebar.css"),
    "utf-8",
  );

  function ruleBlock(selector: string): string {
    const index = css.indexOf(`${selector} {`);
    expect(index, `未找到选择器 ${selector}`).toBeGreaterThanOrEqual(0);
    const start = css.indexOf("{", index);
    const end = css.indexOf("}", start);
    return css.slice(start + 1, end);
  }

  it("文件树滚动容器有保底高度（不再允许被压缩到 0）", () => {
    const block = ruleBlock(".workspace-tree-scroll");
    expect(block).toMatch(/min-height:\s*120px/);
  });

  it("区块允许收缩且保留标题行最小高度", () => {
    const block = ruleBlock(".recent-section");
    expect(block).toMatch(/flex-shrink:\s*1/);
    expect(block).toMatch(/min-height:\s*26px/);
    expect(block).toMatch(/max-height:\s*35%/); // 单区块上限保持
  });
});
