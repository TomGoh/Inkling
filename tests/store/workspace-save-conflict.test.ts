// 保存冲突保护测试（v2.3.8 修复 #59 的保存前基线比对）
// 验证：普通文件保存前读磁盘与 diskContent 基线比对；
// - 外部已修改 → 弹确认，用户拒绝则不保存
// - 外部已修改 → 用户确认覆盖则保存并更新基线
// - 磁盘与基线一致 → 直接保存不弹确认

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenTab } from "../../src/store/workspace";

const { readTextFileMock, writeTextFileMock, askMock, isTauriMock } = vi.hoisted(() => ({
  readTextFileMock: vi.fn(),
  writeTextFileMock: vi.fn(),
  askMock: vi.fn(),
  isTauriMock: vi.fn(() => true),
}));

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: isTauriMock,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  ask: askMock,
  save: vi.fn(),
}));

vi.mock("../../src/lib/fs", () => ({
  readTextFile: readTextFileMock,
  writeTextFile: writeTextFileMock,
}));

import { useWorkspace } from "../../src/store/workspace";

function tab(path: string, content: string, diskContent: string): OpenTab {
  return {
    path,
    content,
    cursorPos: null,
    scrollTop: null,
    dirty: true,
    isUntitled: false,
    diskContent,
    lastSavedAt: null,
  };
}

function setState(next: Partial<ReturnType<typeof useWorkspace.getState>>) {
  useWorkspace.setState(next as any);
}

describe("saveCurrent 外部修改冲突保护", () => {
  beforeEach(() => {
    readTextFileMock.mockReset();
    writeTextFileMock.mockReset();
    askMock.mockReset();
    isTauriMock.mockReset();
    isTauriMock.mockReturnValue(true);
    readTextFileMock.mockResolvedValue("磁盘基线");
    writeTextFileMock.mockResolvedValue(undefined);
    askMock.mockResolvedValue(false);
    setState({
      openTabs: [tab("/docs/a.md", "本地编辑", "磁盘基线")],
      activeTabPath: "/docs/a.md",
      currentFile: "/docs/a.md",
      currentContent: "本地编辑",
      dirty: true,
      saving: false,
      saveError: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("磁盘内容与基线一致：直接保存，不弹确认", async () => {
    await useWorkspace.getState().saveCurrent();

    expect(askMock).not.toHaveBeenCalled();
    expect(writeTextFileMock).toHaveBeenCalledWith("/docs/a.md", "本地编辑");
    const s = useWorkspace.getState();
    expect(s.dirty).toBe(false);
    // 保存后基线更新为本次写入内容
    expect(s.openTabs.find((t) => t.path === "/docs/a.md")?.diskContent).toBe("本地编辑");
  });

  it("磁盘被外部修改：用户拒绝覆盖则不保存", async () => {
    readTextFileMock.mockResolvedValue("外部新内容");
    askMock.mockResolvedValue(false);

    await useWorkspace.getState().saveCurrent();

    expect(askMock).toHaveBeenCalledTimes(1);
    expect(writeTextFileMock).not.toHaveBeenCalled();
    expect(useWorkspace.getState().dirty).toBe(true);
  });

  it("磁盘被外部修改：用户确认覆盖则保存并更新基线", async () => {
    readTextFileMock.mockResolvedValue("外部新内容");
    askMock.mockResolvedValue(true);

    await useWorkspace.getState().saveCurrent();

    expect(writeTextFileMock).toHaveBeenCalledWith("/docs/a.md", "本地编辑");
    expect(useWorkspace.getState().dirty).toBe(false);
    expect(
      useWorkspace.getState().openTabs.find((t) => t.path === "/docs/a.md")?.diskContent,
    ).toBe("本地编辑");
  });

  it("磁盘读取失败（文件被删）：继续尝试保存", async () => {
    readTextFileMock.mockRejectedValue(new Error("文件不存在"));

    await useWorkspace.getState().saveCurrent();

    expect(askMock).not.toHaveBeenCalled();
    expect(writeTextFileMock).toHaveBeenCalledWith("/docs/a.md", "本地编辑");
  });
  it("自动保存（非交互）：外部冲突时不弹窗，标记 conflictPending", async () => {
    readTextFileMock.mockResolvedValue("外部新内容");

    await useWorkspace.getState().saveCurrent({ interactive: false });

    expect(askMock).not.toHaveBeenCalled();
    expect(writeTextFileMock).not.toHaveBeenCalled();
    expect(useWorkspace.getState().conflictPending).toBe(true);
    expect(useWorkspace.getState().openTabs[0].conflictPending).toBe(true);
  });
});

describe("reloadFile 强制重载", () => {
  beforeEach(() => {
    readTextFileMock.mockReset();
    writeTextFileMock.mockReset();
    isTauriMock.mockReset();
    isTauriMock.mockReturnValue(true);
    readTextFileMock.mockResolvedValue("磁盘最新内容");
    setState({
      openTabs: [tab("/docs/a.md", "本地编辑", "磁盘基线")],
      activeTabPath: "/docs/a.md",
      currentFile: "/docs/a.md",
      currentContent: "本地编辑",
      dirty: true,
      splitFile: null,
      splitContent: "",
      saving: false,
      saveError: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("强制从磁盘重读并清掉 dirty，递增 tab revision", async () => {
    await useWorkspace.getState().reloadFile("/docs/a.md");

    expect(readTextFileMock).toHaveBeenCalledWith("/docs/a.md");
    const s = useWorkspace.getState();
    expect(s.currentContent).toBe("磁盘最新内容");
    expect(s.dirty).toBe(false);
    const t = s.openTabs.find((x) => x.path === "/docs/a.md")!;
    expect(t.content).toBe("磁盘最新内容");
    expect(t.dirty).toBe(false);
    // 重载后基线同步为磁盘内容，后续保存不再误报冲突
    expect(t.diskContent).toBe("磁盘最新内容");
    expect(t.revision).toBe(1);
  });

  it("非活跃 tab 重载不动主面板镜像，分屏展示时同步分屏内容", async () => {
    setState({
      openTabs: [tab("/docs/a.md", "本地编辑", "磁盘基线")],
      activeTabPath: "/docs/a.md",
      currentContent: "本地编辑",
      splitFile: "/docs/a.md",
      splitContent: "本地编辑",
      dirty: true,
    });

    await useWorkspace.getState().reloadFile("/docs/a.md");

    // 同一文件既是主面板又是分屏：两侧都应刷新
    const s = useWorkspace.getState();
    expect(s.splitContent).toBe("磁盘最新内容");
    expect(s.currentContent).toBe("磁盘最新内容");
  });

  it("未打开的文件退化为 openFile", async () => {
    const openFileSpy = vi.spyOn(useWorkspace.getState(), "openFile");
    await useWorkspace.getState().reloadFile("/docs/not-open.md");
    expect(openFileSpy).toHaveBeenCalledWith("/docs/not-open.md");
    openFileSpy.mockRestore();
  });

  it("setTabDiskContent 正确更新指定 tab 的 diskContent", () => {
    useWorkspace.getState().setTabDiskContent("/docs/a.md", "更新后的磁盘基线");
    const t = useWorkspace.getState().openTabs.find((x) => x.path === "/docs/a.md");
    expect(t?.diskContent).toBe("更新后的磁盘基线");
  });
});
