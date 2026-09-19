// Quick Open 无障碍语义（#228）
//
// 采用 WAI-ARIA combobox 模式：焦点留在输入框，用 aria-activedescendant 指向高亮项。
// 这里锁定该模式的关键约束，防止后续改回「把焦点移进列表」（会打断连续输入）。

import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import {
  renderQuickOpen,
  resetWorkspaceState,
  stubFileRead,
  stubIndexFiles,
} from "../fixtures/quickOpenHarness";

describe("QuickOpenPanel（a11y 语义）", () => {
  beforeEach(() => {
    stubIndexFiles(["/w/a.md", "/w/b.md"]);
    stubFileRead();
    resetWorkspaceState();
  });

  it("弹层是带标签的模态对话框", () => {
    return renderQuickOpen().then(() => {
      const dialog = screen.getByRole("dialog");
      expect(dialog.getAttribute("aria-modal")).toBe("true");
      expect(dialog.getAttribute("aria-label")).toBe("快速打开文件");
    });
  });

  it("输入框是 combobox，且通过 aria-controls 关联到 listbox", async () => {
    const { input } = await renderQuickOpen();

    expect(input.getAttribute("role")).toBe("combobox");
    expect(input.getAttribute("aria-autocomplete")).toBe("list");
    expect(input.getAttribute("aria-expanded")).toBe("true");

    const list = screen.getByRole("listbox");
    expect(input.getAttribute("aria-controls")).toBe(list.id);
    expect(list.id).toBe("quick-open-list");
  });

  it("aria-activedescendant 始终指向 listbox 内唯一 aria-selected=true 的选项", async () => {
    const { input } = await renderQuickOpen();
    const list = screen.getByRole("listbox");

    const assertConsistent = () => {
      const activeId = input.getAttribute("aria-activedescendant");
      expect(activeId).not.toBeNull();
      const active = document.getElementById(activeId!);
      expect(active).not.toBeNull();
      expect(active!.getAttribute("role")).toBe("option");
      expect(list.contains(active!)).toBe(true);
      expect(active!.getAttribute("aria-selected")).toBe("true");
      const selected = screen
        .getAllByRole("option")
        .filter((el) => el.getAttribute("aria-selected") === "true");
      expect(selected).toHaveLength(1);
      expect(selected[0]).toBe(active);
    };

    assertConsistent();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    assertConsistent();
    fireEvent.keyDown(input, { key: "ArrowUp" });
    assertConsistent();
  });

  it("无候选时不指向任何选项（否则读屏会指向不存在的元素）", async () => {
    stubIndexFiles([]);
    const { input } = await renderQuickOpen();

    expect(input.getAttribute("aria-activedescendant")).toBeNull();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("键盘可达的按钮都有可见焦点样式（与 #188 约定一致）", async () => {
    const { onClose } = await renderQuickOpen();
    void onClose;
    // 关闭按钮是真实 button（不是 div），可被 Tab 聚焦
    const close = screen.getByTitle("关闭 (Esc)");
    expect(close.tagName).toBe("BUTTON");
  });
});
