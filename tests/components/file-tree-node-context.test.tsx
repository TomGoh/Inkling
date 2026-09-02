// #158 文件树非 Markdown 文件行右键可达测试
//
// 背景：非 md 文件行渲染为 disabled <button>，Chromium/WebView2 对 disabled
// 表单控件抑制 contextmenu 等鼠标事件，重命名/删除/复制路径等右键操作
// （对 txt/png 等文件是唯一可用操作）完全失效。
//
// 验证：改用 aria-disabled + onClick 拦截后——
// - 非 md 文件行不再带原生 disabled（鼠标事件可达），保留视觉弱化类名
// - contextmenu 事件能触达 onMenu（右键菜单可唤起）
// - 点击仍不会触发打开（禁用语义保留，onOpen 不被调用）
// - md 文件行行为不变：可点击打开、可右键、无 aria-disabled

import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FileTreeNode } from "../../src/components/Sidebar/FileTreeNode";
import type { FileNode } from "../../src/lib/fs";

function fileNode(name: string): FileNode {
  return { name, path: `/workspace/${name}`, is_dir: false, children: [] };
}

function makeProps(node: FileNode) {
  return {
    node,
    depth: 1,
    expanded: false,
    loaded: true,
    loading: false,
    error: false,
    active: false,
    opened: false,
    opening: false,
    openError: undefined,
    renaming: false,
    renameValue: "",
    renameInputRef: { current: null } as React.RefObject<HTMLInputElement | null>,
    onRenameValue: vi.fn(),
    onCommitRename: vi.fn().mockResolvedValue(undefined),
    onCancelRename: vi.fn(),
    onToggle: vi.fn(),
    onOpen: vi.fn(),
    onMenu: vi.fn(),
    loadDirectory: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("#158 非 Markdown 文件行的右键菜单可达性", () => {
  it("非 md 文件行不带原生 disabled，保留视觉弱化类名与 aria-disabled", () => {
    render(<FileTreeNode {...makeProps(fileNode("data.txt"))} />);
    const row = screen.getByText("data.txt").closest("button")!;

    expect(row).toBeEnabled(); // 原生 disabled 已移除（否则浏览器抑制鼠标事件）
    expect(row).toHaveAttribute("aria-disabled", "true"); // 禁用语义仍对辅助技术可见
    expect(row.className).toContain("tree-row-file-disabled"); // 视觉弱化保持
    cleanup();
  });

  it("非 md 文件行 contextmenu 事件触达 onMenu（右键菜单可唤起）", () => {
    const props = makeProps(fileNode("photo.png"));
    render(<FileTreeNode {...props} />);
    const row = screen.getByText("photo.png").closest("button")!;

    fireEvent.contextMenu(row);

    expect(props.onMenu).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("非 md 文件行点击不触发打开（onClick 内拦截，禁用语义保留）", () => {
    const props = makeProps(fileNode("data.txt"));
    render(<FileTreeNode {...props} />);
    const row = screen.getByText("data.txt").closest("button")!;

    fireEvent.click(row);

    expect(props.onOpen).not.toHaveBeenCalled();
    cleanup();
  });

  it("md 文件行行为不变：无 aria-disabled，点击打开且右键可用", () => {
    const props = makeProps(fileNode("notes.md"));
    render(<FileTreeNode {...props} />);
    const row = screen.getByText("notes.md").closest("button")!;

    expect(row).not.toHaveAttribute("aria-disabled");
    expect(row.className).not.toContain("tree-row-file-disabled");

    fireEvent.click(row);
    expect(props.onOpen).toHaveBeenCalledTimes(1);

    fireEvent.contextMenu(row);
    expect(props.onMenu).toHaveBeenCalledTimes(1);
    cleanup();
  });
});
