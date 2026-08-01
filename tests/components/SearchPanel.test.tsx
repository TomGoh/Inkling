// SearchPanel 组件测试
// 验证：渲染查找框、展开替换框、输入触发搜索、点击替换/全部按钮调用对应方法
// 通过 mock getEditor 返回假的 editor.action，捕获 dispatch 的 meta 验证调用

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SearchPanel } from "../../src/components/Editor/SearchPanel";

// 构造假 editor：action 回调里捕获 view 引用，view.dispatch 记录 meta
function makeFakeEditor() {
  const dispatches: unknown[] = [];
  const view = {
    state: {
      tr: {
        setMeta: vi.fn().mockReturnThis(),
        replaceWith: vi.fn().mockReturnThis(),
      },
      schema: {
        text: vi.fn((s: string) => ({ text: s })),
      },
    },
    dispatch: vi.fn((tr: unknown) => dispatches.push(tr)),
  };
  const editor = {
    action: vi.fn((cb: (ctx: unknown) => void) => {
      // 给 cb 注入一个 ctx，ctx.get(editorViewCtx) 返回 view
      cb({ get: () => view });
    }),
  };
  return { editor, view, dispatches };
}

// mock search 模块的 getState 返回值
vi.mock("../../src/components/Editor/search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/components/Editor/search")>();
  return {
    ...actual,
    // getState 返回假数据：3 个匹配，当前第 1 个
    searchKey: {
      ...actual.searchKey,
      getState: () => ({
        opts: { find: "test", replace: "ok", caseSensitive: false, useRegex: false },
        matches: [
          { from: 0, to: 4 },
          { from: 10, to: 14 },
          { from: 20, to: 24 },
        ],
        current: 0,
      }),
    },
    replaceCurrent: vi.fn(),
    replaceAll: vi.fn().mockReturnValue(3),
    scrollToCurrent: vi.fn(),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SearchPanel", () => {
  it("渲染查找输入框", () => {
    const { editor } = makeFakeEditor();
    render(<SearchPanel getEditor={() => editor as any} onClose={() => {}} showReplace={false} onShowReplaceChange={() => {}} />);
    expect(screen.getByPlaceholderText("查找")).toBeInTheDocument();
  });

  it("showReplace=false 不显示替换框，点击展开按钮调用 onShowReplaceChange", () => {
    const { editor } = makeFakeEditor();
    const onShow = vi.fn();
    const { container } = render(<SearchPanel getEditor={() => editor as any} onClose={() => {}} showReplace={false} onShowReplaceChange={onShow} />);
    expect(screen.queryByPlaceholderText("替换")).not.toBeInTheDocument();
    const expandBtn = container.querySelector(".search-toggle-expand");
    expect(expandBtn).not.toBeNull();
    fireEvent.click(expandBtn!);
    expect(onShow).toHaveBeenCalledWith(true);
  });

  it("showReplace=true 显示替换框", () => {
    const { editor } = makeFakeEditor();
    render(<SearchPanel getEditor={() => editor as any} onClose={() => {}} showReplace={true} onShowReplaceChange={() => {}} />);
    expect(screen.getByPlaceholderText("替换")).toBeInTheDocument();
  });

  it("显示匹配计数", () => {
    const { editor } = makeFakeEditor();
    render(<SearchPanel getEditor={() => editor as any} onClose={() => {}} showReplace={false} onShowReplaceChange={() => {}} />);
    // mock 的 getState 返回 current=0（第1个），matches=3
    expect(screen.getByText(/1\/3/)).toBeInTheDocument();
  });

  it("Esc 关闭面板", () => {
    const { editor } = makeFakeEditor();
    const onClose = vi.fn();
    render(<SearchPanel getEditor={() => editor as any} onClose={onClose} showReplace={false} onShowReplaceChange={() => {}} />);
    fireEvent.keyDown(screen.getByPlaceholderText("查找"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("Enter 触发下一个", () => {
    const { editor, view } = makeFakeEditor();
    render(<SearchPanel getEditor={() => editor as any} onClose={() => {}} showReplace={false} onShowReplaceChange={() => {}} />);
    fireEvent.keyDown(screen.getByPlaceholderText("查找"), { key: "Enter" });
    expect(view.dispatch).toHaveBeenCalled();
  });

  it("Shift+Enter 触发上一个", () => {
    const { editor, view } = makeFakeEditor();
    render(<SearchPanel getEditor={() => editor as any} onClose={() => {}} showReplace={false} onShowReplaceChange={() => {}} />);
    fireEvent.keyDown(screen.getByPlaceholderText("查找"), { key: "Enter", shiftKey: true });
    expect(view.dispatch).toHaveBeenCalled();
  });

  it("点击「全部」按钮调用 replaceAll", async () => {
    const { editor } = makeFakeEditor();
    const { replaceAll } = await import("../../src/components/Editor/search");
    render(<SearchPanel getEditor={() => editor as any} onClose={() => {}} showReplace={true} onShowReplaceChange={() => {}} />);
    fireEvent.click(screen.getByTitle("全部替换"));
    expect(replaceAll).toHaveBeenCalled();
  });

  it("点击「替换」按钮调用 replaceCurrent", async () => {
    const { editor } = makeFakeEditor();
    const { replaceCurrent } = await import("../../src/components/Editor/search");
    render(<SearchPanel getEditor={() => editor as any} onClose={() => {}} showReplace={true} onShowReplaceChange={() => {}} />);
    fireEvent.click(screen.getByTitle("替换当前"));
    expect(replaceCurrent).toHaveBeenCalled();
  });

  it("点击关闭按钮调用 onClose", () => {
    const { editor } = makeFakeEditor();
    const onClose = vi.fn();
    render(<SearchPanel getEditor={() => editor as any} onClose={onClose} showReplace={false} onShowReplaceChange={() => {}} />);
    fireEvent.click(screen.getByTitle("关闭"));
    expect(onClose).toHaveBeenCalled();
  });

  it("切换大小写敏感", () => {
    const { editor } = makeFakeEditor();
    render(<SearchPanel getEditor={() => editor as any} onClose={() => {}} showReplace={false} onShowReplaceChange={() => {}} />);
    const caseBtn = screen.getByTitle("区分大小写");
    expect(caseBtn).not.toHaveClass("active");
    fireEvent.click(caseBtn);
    expect(caseBtn).toHaveClass("active");
  });

  it("切换正则模式", () => {
    const { editor } = makeFakeEditor();
    render(<SearchPanel getEditor={() => editor as any} onClose={() => {}} showReplace={false} onShowReplaceChange={() => {}} />);
    const regexBtn = screen.getByTitle("正则表达式");
    expect(regexBtn).not.toHaveClass("active");
    fireEvent.click(regexBtn);
    expect(regexBtn).toHaveClass("active");
  });
});
