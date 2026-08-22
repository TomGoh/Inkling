import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useStartupFile } from "../../src/lib/useStartupFile";
import { useWorkspace } from "../../src/store/workspace";
import * as tauriCore from "@tauri-apps/api/core";
import * as tauriEvent from "@tauri-apps/api/event";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

describe("useStartupFile hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspace.setState({
      openTabs: [],
      activeTabPath: null,
      workspaceMode: "closed",
      rootPath: null,
    });
  });

  it("should open startup file if take_pending_file returns path and is Markdown", async () => {
    vi.mocked(tauriCore.isTauri).mockReturnValue(true);
    vi.mocked(tauriCore.invoke).mockImplementation(async (cmd, args: any) => {
      if (cmd === "take_pending_file") return "/path/to/startup.md";
      if (cmd === "read_text_file") return "# Startup Note";
      return "";
    });

    renderHook(() => useStartupFile());

    await vi.waitFor(() => {
      const state = useWorkspace.getState();
      expect(state.openTabs.length).toBe(1);
      expect(state.openTabs[0].path).toBe("/path/to/startup.md");
      expect(state.openTabs[0].content).toBe("# Startup Note");
    });
  });

  it("should open file when open-file event is received", async () => {
    vi.mocked(tauriCore.isTauri).mockReturnValue(true);
    let eventCallback: any = null;
    vi.mocked(tauriEvent.listen).mockImplementation(async (event: string, cb: any) => {
      if (event === "open-file") {
        eventCallback = cb;
      }
      return () => {};
    });
    vi.mocked(tauriCore.invoke).mockImplementation(async (cmd, args: any) => {
      if (cmd === "take_pending_file") return null;
      if (cmd === "read_text_file") return "# From Single Instance";
      return "";
    });

    renderHook(() => useStartupFile());

    // 触发 open-file 事件
    if (eventCallback) {
      await eventCallback({ payload: "/path/to/second.md" });
    }

    await vi.waitFor(() => {
      const state = useWorkspace.getState();
      expect(state.openTabs.length).toBe(1);
      expect(state.openTabs[0].path).toBe("/path/to/second.md");
      expect(state.openTabs[0].content).toBe("# From Single Instance");
    });
  });

  it("should do nothing in non-tauri or empty startup file", async () => {
    vi.mocked(tauriCore.isTauri).mockReturnValue(false);

    renderHook(() => useStartupFile());

    expect(tauriCore.invoke).not.toHaveBeenCalled();
    expect(useWorkspace.getState().openTabs.length).toBe(0);
  });
});
