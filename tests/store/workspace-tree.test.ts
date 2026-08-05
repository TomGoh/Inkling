// 工作区文件树状态测试
// 覆盖单层加载、目录请求去重、工作区切换竞态和局部刷新

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileNode } from "../../src/lib/fs";

const { listDirMock, readTextFileMock, writeTextFileMock } = vi.hoisted(() => ({
  listDirMock: vi.fn(),
  readTextFileMock: vi.fn(),
  writeTextFileMock: vi.fn(),
}));

vi.mock("../../src/lib/fs", () => ({
  listDir: listDirMock,
  readTextFile: readTextFileMock,
  writeTextFile: writeTextFileMock,
}));

import { useWorkspace } from "../../src/store/workspace";

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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  listDirMock.mockReset();
  readTextFileMock.mockReset();
  writeTextFileMock.mockReset();
  readTextFileMock.mockResolvedValue("# test");
  writeTextFileMock.mockResolvedValue(undefined);
  useWorkspace.setState({
    rootPath: null,
    workspaceMode: null,
    tree: null,
    loading: false,
    expandedDirs: new Set(),
    loadedDirs: new Set(),
    loadingDirs: new Set(),
    directoryErrors: new Map(),
    openTabs: [],
    activeTabPath: null,
    currentFile: null,
    currentContent: "",
    recentFiles: [],
  });
});

describe("工作区按需加载", () => {
  it("打开工作区只读取根目录一层，并默认只展开根目录", async () => {
    listDirMock.mockResolvedValue(dir("/workspace", [dir("/workspace/docs")]));

    await useWorkspace.getState().openWorkspace("/workspace");

    expect(listDirMock).toHaveBeenCalledTimes(1);
    expect(listDirMock).toHaveBeenCalledWith("/workspace");
    expect(useWorkspace.getState().loadedDirs).toEqual(new Set(["/workspace"]));
    expect(useWorkspace.getState().expandedDirs.has("/workspace")).toBe(true);
    expect(useWorkspace.getState().expandedDirs.has("/workspace/docs")).toBe(false);
  });

  it("同一目录的并发加载只枚举一次", async () => {
    const listing = deferred<FileNode>();
    listDirMock.mockReturnValue(listing.promise);
    useWorkspace.setState({
      rootPath: "/workspace",
      workspaceMode: "folder",
      tree: dir("/workspace", [dir("/workspace/docs")]),
      expandedDirs: new Set(["/workspace", "/workspace/docs"]),
      loadedDirs: new Set(["/workspace"]),
    });

    const first = useWorkspace.getState().loadDirectory("/workspace/docs");
    const second = useWorkspace.getState().loadDirectory("/workspace/docs");
    expect(listDirMock).toHaveBeenCalledTimes(1);

    listing.resolve(dir("/workspace/docs", [file("/workspace/docs/readme.md")]));
    await Promise.all([first, second]);

    expect(useWorkspace.getState().loadedDirs.has("/workspace/docs")).toBe(true);
    expect(useWorkspace.getState().tree?.children[0].children[0].name).toBe("readme.md");
  });

  it("目录连续发生强制刷新时，每轮扫描后继续追赶最新变更", async () => {
    const initial = deferred<FileNode>();
    const firstRefresh = deferred<FileNode>();
    const finalRefresh = deferred<FileNode>();
    listDirMock
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(firstRefresh.promise)
      .mockReturnValueOnce(finalRefresh.promise);
    useWorkspace.setState({
      rootPath: "/workspace",
      workspaceMode: "folder",
      tree: dir("/workspace", [dir("/workspace/docs")]),
      loadedDirs: new Set(["/workspace"]),
    });

    const load = useWorkspace.getState().loadDirectory("/workspace/docs");
    const refresh = useWorkspace.getState().refreshTree("/workspace/docs");
    expect(listDirMock).toHaveBeenCalledTimes(1);

    initial.resolve(dir("/workspace/docs"));
    await vi.waitFor(() => expect(listDirMock).toHaveBeenCalledTimes(2));
    const trailingRefresh = useWorkspace.getState().refreshTree("/workspace/docs");
    firstRefresh.resolve(dir("/workspace/docs", [file("/workspace/docs/stale.md")]));
    await vi.waitFor(() => expect(listDirMock).toHaveBeenCalledTimes(3));
    finalRefresh.resolve(dir("/workspace/docs", [file("/workspace/docs/new.md")]));
    await Promise.all([load, refresh, trailingRefresh]);

    expect(useWorkspace.getState().tree?.children[0].children[0].name).toBe("new.md");
  });

  it("目录加载失败后清理加载状态并允许重试", async () => {
    useWorkspace.setState({
      rootPath: "/workspace",
      workspaceMode: "folder",
      tree: dir("/workspace", [dir("/workspace/docs")]),
      loadedDirs: new Set(["/workspace"]),
    });
    listDirMock.mockRejectedValueOnce(new Error("permission denied"));

    await expect(
      useWorkspace.getState().loadDirectory("/workspace/docs"),
    ).rejects.toThrow("permission denied");
    expect(useWorkspace.getState().loadingDirs.has("/workspace/docs")).toBe(false);
    expect(useWorkspace.getState().directoryErrors.get("/workspace/docs")).toBe(
      "permission denied",
    );

    listDirMock.mockResolvedValueOnce(dir("/workspace/docs"));
    await useWorkspace.getState().loadDirectory("/workspace/docs");
    expect(listDirMock).toHaveBeenCalledTimes(2);
    expect(useWorkspace.getState().directoryErrors.has("/workspace/docs")).toBe(false);
  });

  it("较旧的工作区结果不会覆盖后来打开的工作区", async () => {
    const first = deferred<FileNode>();
    const second = deferred<FileNode>();
    listDirMock.mockImplementation((path: string) =>
      path === "/first" ? first.promise : second.promise,
    );

    const openFirst = useWorkspace.getState().openWorkspace("/first");
    const openSecond = useWorkspace.getState().openWorkspace("/second");
    second.resolve(dir("/second", [file("/second/current.md")]));
    await openSecond;
    first.resolve(dir("/first", [file("/first/stale.md")]));
    await openFirst;

    expect(useWorkspace.getState().rootPath).toBe("/second");
    expect(useWorkspace.getState().tree?.path).toBe("/second");
  });

  it("打开新工作区失败时保留原有工作区", async () => {
    const previousTree = dir("/workspace", [file("/workspace/kept.md")]);
    useWorkspace.setState({
      rootPath: "/workspace",
      workspaceMode: "folder",
      tree: previousTree,
      expandedDirs: new Set(["/workspace"]),
      loadedDirs: new Set(["/workspace"]),
    });
    listDirMock.mockRejectedValue(new Error("permission denied"));

    await expect(useWorkspace.getState().openWorkspace("/forbidden")).rejects.toThrow(
      "permission denied",
    );

    expect(useWorkspace.getState().rootPath).toBe("/workspace");
    expect(useWorkspace.getState().tree).toBe(previousTree);
    expect(useWorkspace.getState().expandedDirs).toEqual(new Set(["/workspace"]));
    expect(useWorkspace.getState().loading).toBe(false);
  });

  it("刷新父目录时保留已经加载的子树", async () => {
    useWorkspace.setState({
      rootPath: "/workspace",
      workspaceMode: "folder",
      tree: dir("/workspace", [
        dir("/workspace/docs", [
          dir("/workspace/docs/guide", [file("/workspace/docs/guide/a.md")]),
        ]),
      ]),
      loadedDirs: new Set([
        "/workspace",
        "/workspace/docs",
        "/workspace/docs/guide",
      ]),
    });
    listDirMock.mockResolvedValue(
      dir("/workspace", [dir("/workspace/docs"), file("/workspace/root.md")]),
    );

    await useWorkspace.getState().refreshTree();

    expect(useWorkspace.getState().tree?.children[0].children[0].children[0].name).toBe(
      "a.md",
    );
    expect(useWorkspace.getState().loadedDirs.has("/workspace/docs/guide")).toBe(true);
  });

  it("打开文件不会重新枚举工作区", async () => {
    await useWorkspace.getState().openFile("/workspace/readme.md");

    expect(readTextFileMock).toHaveBeenCalledWith("/workspace/readme.md");
    expect(listDirMock).not.toHaveBeenCalled();
  });

  it("删除目录时清理该路径下的加载与展开状态", async () => {
    listDirMock.mockResolvedValue(dir("/workspace"));
    useWorkspace.setState({
      rootPath: "/workspace",
      workspaceMode: "folder",
      tree: dir("/workspace", [dir("/workspace/docs")]),
      expandedDirs: new Set(["/workspace", "/workspace/docs", "/workspace/docs/guide"]),
      loadedDirs: new Set(["/workspace", "/workspace/docs", "/workspace/docs/guide"]),
      loadingDirs: new Set(["/workspace/docs/guide"]),
      directoryErrors: new Map([["/workspace/docs", "failed"]]),
    });

    useWorkspace.getState().onFileDeleted("/workspace/docs");

    expect(useWorkspace.getState().expandedDirs).toEqual(new Set(["/workspace"]));
    expect(useWorkspace.getState().loadedDirs).toEqual(new Set(["/workspace"]));
    expect(useWorkspace.getState().loadingDirs.has("/workspace/docs/guide")).toBe(false);
    expect(useWorkspace.getState().directoryErrors).toEqual(new Map());
    await vi.waitFor(() => expect(useWorkspace.getState().tree?.children).toEqual([]));
    expect(useWorkspace.getState().loadingDirs).toEqual(new Set());
  });

  it("目录重命名时迁移展开偏好，并让新路径重新加载", async () => {
    listDirMock.mockResolvedValue(dir("/workspace", [dir("/workspace/notes")]));
    useWorkspace.setState({
      rootPath: "/workspace",
      workspaceMode: "folder",
      tree: dir("/workspace", [dir("/workspace/docs")]),
      expandedDirs: new Set(["/workspace", "/workspace/docs", "/workspace/docs/guide"]),
      loadedDirs: new Set(["/workspace", "/workspace/docs", "/workspace/docs/guide"]),
    });

    useWorkspace.getState().onFileRenamed("/workspace/docs", "/workspace/notes");

    expect(useWorkspace.getState().expandedDirs).toEqual(
      new Set(["/workspace", "/workspace/notes", "/workspace/notes/guide"]),
    );
    expect(useWorkspace.getState().loadedDirs).toEqual(new Set(["/workspace"]));
    await vi.waitFor(() =>
      expect(useWorkspace.getState().tree?.children[0].path).toBe("/workspace/notes"),
    );
  });
});
