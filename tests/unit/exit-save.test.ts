import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenTab } from "../../src/store/workspace";

const { onCloseRequestedMock, destroyMock, askMock, flushMock } = vi.hoisted(() => ({
  onCloseRequestedMock: vi.fn(),
  destroyMock: vi.fn(),
  askMock: vi.fn(),
  flushMock: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ onCloseRequested: onCloseRequestedMock, destroy: destroyMock }),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: askMock }));
vi.mock("../../src/components/Editor/markdown-publisher", () => ({
  flushAllMarkdownPublishers: flushMock,
}));

import { useExitHandler } from "../../src/lib/useExitHandler";
import { useWorkspace } from "../../src/store/workspace";

type CloseHandler = (event: { preventDefault: () => void }) => Promise<void>;
let closeHandler: CloseHandler;

function tab(path: string): OpenTab {
  return {
    path,
    content: `${path} modified`,
    diskContent: path,
    dirty: true,
    lastSavedAt: null,
    cursorPos: null,
    scrollTop: null,
  };
}

function installState(tabs = [tab("/one.md"), tab("/two.md")]) {
  const switchTab = vi.fn((path: string) => {
    const target = useWorkspace.getState().openTabs.find((item) => item.path === path)!;
    useWorkspace.setState({
      activeTabPath: path,
      currentFile: path,
      currentContent: target.content,
      dirty: target.dirty,
    });
  });
  const saveCurrent = vi.fn(async () => {
    const path = useWorkspace.getState().activeTabPath;
    useWorkspace.setState((state) => ({
      openTabs: state.openTabs.map((item) =>
        item.path === path ? { ...item, dirty: false } : item,
      ),
      dirty: false,
    }));
  });
  useWorkspace.setState({
    openTabs: tabs,
    activeTabPath: tabs[0]?.path ?? null,
    currentFile: tabs[0]?.path ?? null,
    currentContent: tabs[0]?.content ?? "",
    dirty: tabs[0]?.dirty ?? false,
    switchTab,
    saveCurrent,
  });
  return { switchTab, saveCurrent };
}

describe("real window close handler", () => {
  beforeEach(() => {
    onCloseRequestedMock.mockReset().mockImplementation(async (handler: CloseHandler) => {
      closeHandler = handler;
      return vi.fn();
    });
    destroyMock.mockReset().mockResolvedValue(undefined);
    askMock.mockReset().mockResolvedValue(false);
    flushMock.mockReset();
  });

  async function mount() {
    renderHook(() => useExitHandler());
    await vi.waitFor(() => expect(onCloseRequestedMock).toHaveBeenCalled());
  }

  it("flushes and saves every dirty tab before destroying the window", async () => {
    const { saveCurrent } = installState();
    await mount();
    const preventDefault = vi.fn();
    await act(() => closeHandler({ preventDefault }));
    expect(preventDefault).toHaveBeenCalled();
    expect(flushMock).toHaveBeenCalled();
    expect(saveCurrent).toHaveBeenCalledTimes(2);
    expect(useWorkspace.getState().openTabs.every((item) => !item.dirty)).toBe(true);
    expect(destroyMock).toHaveBeenCalledTimes(1);
  });

  it("continues with later tabs when one save rejects", async () => {
    const { saveCurrent } = installState();
    saveCurrent.mockRejectedValueOnce(new Error("first failed"));
    askMock.mockResolvedValue(true);
    await mount();
    await act(() => closeHandler({ preventDefault: vi.fn() }));
    expect(saveCurrent).toHaveBeenCalledTimes(2);
    expect(askMock).toHaveBeenCalledTimes(1);
    expect(destroyMock).toHaveBeenCalledTimes(1);
  });

  it("asks before discarding remaining changes and restores the original tab on cancel", async () => {
    const { switchTab, saveCurrent } = installState();
    saveCurrent.mockResolvedValue(undefined);
    await mount();
    await act(() => closeHandler({ preventDefault: vi.fn() }));
    expect(askMock).toHaveBeenCalledWith(expect.stringContaining("未保存"), expect.any(Object));
    expect(switchTab).toHaveBeenLastCalledWith("/one.md");
    expect(destroyMock).not.toHaveBeenCalled();
  });

  it("fails safe when the confirmation dialog throws", async () => {
    const { saveCurrent } = installState();
    saveCurrent.mockResolvedValue(undefined);
    askMock.mockRejectedValue(new Error("dialog unavailable"));
    await mount();
    await act(() => closeHandler({ preventDefault: vi.fn() }));
    expect(destroyMock).not.toHaveBeenCalled();
    expect(useWorkspace.getState().activeTabPath).toBe("/one.md");
  });

  it("ignores a second close request while the first save is pending", async () => {
    const { saveCurrent } = installState([tab("/one.md")]);
    let release!: () => void;
    saveCurrent.mockImplementationOnce(() => new Promise<void>((resolve) => {
      release = () => {
        useWorkspace.setState({
          openTabs: [{ ...useWorkspace.getState().openTabs[0], dirty: false }],
          dirty: false,
        });
        resolve();
      };
    }));
    await mount();
    const first = closeHandler({ preventDefault: vi.fn() });
    await vi.waitFor(() => expect(saveCurrent).toHaveBeenCalledTimes(1));
    await closeHandler({ preventDefault: vi.fn() });
    expect(saveCurrent).toHaveBeenCalledTimes(1);
    expect(destroyMock).not.toHaveBeenCalled();
    release();
    await first;
    expect(destroyMock).toHaveBeenCalledTimes(1);
  });

  it("flushes publishers on beforeunload", async () => {
    installState([]);
    await mount();
    window.dispatchEvent(new Event("beforeunload"));
    expect(flushMock).toHaveBeenCalledTimes(1);
  });
});
