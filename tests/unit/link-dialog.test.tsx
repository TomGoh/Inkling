import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LinkDialog } from "../../src/components/Editor/LinkDialog";
import { editorViewCtx } from "@milkdown/kit/core";

describe("LinkDialog", () => {
  let mockDispatch: any;
  let mockEditor: any;

  beforeEach(() => {
    mockDispatch = vi.fn();
    const mockSchema = {
      marks: {
        link: {
          create: (attrs: any) => ({ type: "link", attrs }),
        },
      },
      text: (text: string, marks: any[]) => ({ text, marks }),
    };

    const mockState = {
      selection: { from: 0, to: 0 },
      doc: { textBetween: vi.fn(() => "") },
      schema: mockSchema,
      tr: {
        replaceSelectionWith: vi.fn().mockReturnThis(),
        addMark: vi.fn().mockReturnThis(),
        insertText: vi.fn().mockReturnThis(),
        scrollIntoView: vi.fn().mockReturnThis(),
      },
    };

    mockEditor = {
      action: vi.fn((fn: any) => {
        const ctx = {
          get: (key: any) => {
            if (key === editorViewCtx) {
              return {
                state: mockState,
                dispatch: mockDispatch,
                focus: vi.fn(),
              };
            }
            return null;
          },
        };
        return fn(ctx);
      }),
    };
  });

  it("renders with default url input and submits link insertion", () => {
    const onClose = vi.fn();
    const { container } = render(<LinkDialog getEditor={() => mockEditor} onClose={onClose} />);

    expect(container.querySelector(".link-dialog-modal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭" })).toHaveClass("link-dialog-close");
    expect(screen.getByRole("button", { name: "取消" })).toHaveClass("link-dialog-btn-cancel");
    expect(screen.getByRole("button", { name: /确认插入/i })).toHaveClass(
      "link-dialog-btn-confirm",
    );

    const urlInput = screen.getByLabelText(/链接地址/i);
    const textInput = screen.getByLabelText(/链接文本/i);

    fireEvent.change(urlInput, { target: { value: "https://example.com" } });
    fireEvent.change(textInput, { target: { value: "Example" } });

    const submitBtn = screen.getByRole("button", { name: /确认插入/i });
    fireEvent.click(submitBtn);

    expect(mockEditor.action).toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Escape key", () => {
    const onClose = vi.fn();
    render(<LinkDialog getEditor={() => mockEditor} onClose={onClose} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
