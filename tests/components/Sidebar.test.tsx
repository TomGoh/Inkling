// 侧边栏文件树测试
// 覆盖默认折叠、按需加载、单一动作监听器和大目录窗口化渲染

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Sidebar } from "../../src/components/Sidebar/Sidebar";
import { useWorkspace } from "../../src/store/workspace";
import type { FileNode } from "../../src/lib/fs";

const originalActions = {
  toggleDirExpanded: useWorkspace.getState().toggleDirExpanded,
  setDirExpanded: useWorkspace.getState().setDirExpanded,
  loadDirectory: useWorkspace.getState().loadDirectory,
  openFile: useWorkspace.getState().openFile,
  refreshTree: useWorkspace.getState().refreshTree,
};

function dir(path: string, children: FileNode[] = []): FileNode {
  return {
    name: path.split("/").pop() ?? path,
    path,
    is_dir: true,
    children,
  };
}

function file(path: string): FileNode {
  return {
    name: path.split("/").pop() ?? path,
    path,
    is_dir: false,
    children: [],
  };
}

beforeEach(() => {
  useWorkspace.setState({
    ...originalActions,
    rootPath: "/workspace",
    workspaceMode: "folder",
    tree: null,
    loading: false,
    expandedDirs: new Set(["/workspace"]),
    loadedDirs: new Set(["/workspace"]),
    loadingDirs: new Set(),
    directoryErrors: new Map(),
    openTabs: [],
    currentFile: null,
    recentFiles: [],
    bookmarks: [],
  });
});

afterEach(() => cleanup());

describe("Sidebar 文件树", () => {
  it("普通目录默认折叠，点击后才显示已加载的后代", () => {
    useWorkspace.setState({
      tree: dir("/workspace", [
        dir("/workspace/docs", [file("/workspace/docs/readme.md")]),
      ]),
      loadedDirs: new Set(["/workspace", "/workspace/docs"]),
    });
    render(<Sidebar />);

    expect(screen.queryByText("readme.md")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("docs"));
    expect(screen.getByText("readme.md")).toBeInTheDocument();
  });

  it("首次展开目录只触发该目录的按需加载", () => {
    const loadDirectory = vi.fn().mockResolvedValue(undefined);
    useWorkspace.setState({
      tree: dir("/workspace", [dir("/workspace/docs")]),
      loadDirectory,
    });
    render(<Sidebar />);

    fireEvent.click(screen.getByText("docs"));

    expect(loadDirectory).toHaveBeenCalledTimes(1);
    expect(loadDirectory).toHaveBeenCalledWith("/workspace/docs");
  });

  it("大量根目录文件只渲染视口附近的行", () => {
    const files = Array.from({ length: 10_000 }, (_, index) =>
      file(`/workspace/note-${index}.md`),
    );
    useWorkspace.setState({ tree: dir("/workspace", files) });

    const { container } = render(<Sidebar />);
    const renderedRows = container.querySelectorAll("[data-tree-row]");
    const spacer = container.querySelector<HTMLElement>(".workspace-tree-spacer");

    expect(renderedRows.length).toBeLessThan(100);
    expect(spacer?.style.height).toBe(`${10_001 * 28}px`);
  });

  it("文件树动作监听器数量不随节点数增长", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const files = Array.from({ length: 1_000 }, (_, index) =>
      file(`/workspace/note-${index}.md`),
    );
    useWorkspace.setState({ tree: dir("/workspace", files) });

    render(<Sidebar />);

    const actionListeners = addSpy.mock.calls.filter(
      ([eventName]) => eventName === "inkling-tree-action",
    );
    expect(actionListeners).toHaveLength(1);
  });

  it(".markdown 文件与 .md 文件一样可打开", () => {
    const openFile = vi.fn().mockResolvedValue(undefined);
    useWorkspace.setState({
      tree: dir("/workspace", [file("/workspace/guide.markdown")]),
      openFile,
    });
    render(<Sidebar />);

    fireEvent.click(screen.getByText("guide.markdown"));
    expect(openFile).toHaveBeenCalledWith("/workspace/guide.markdown");
  });
});
