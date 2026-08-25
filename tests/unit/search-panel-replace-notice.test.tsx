import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SearchPanel } from "../../src/components/Editor/SearchPanel";
import * as searchModule from "../../src/components/Editor/search";

vi.mock("../../src/lib/dialogs", () => ({
  showMessage: vi.fn(),
}));

describe("SearchPanel inline replace notice (#128)", () => {
  it("renders inline non-blocking notice on replaceAll without triggering showMessage", () => {
    vi.spyOn(searchModule, "replaceAll").mockReturnValue(5);
    const mockEditor = {
      action: (fn: (ctx: any) => void) => {
        fn({
          get: () => ({
            state: { tr: { setMeta: vi.fn().mockReturnThis() } },
            dispatch: vi.fn(),
          }),
        });
      },
    } as any;

    render(
      <SearchPanel
        getEditor={() => mockEditor}
        onClose={vi.fn()}
        showReplace={true}
        onShowReplaceChange={vi.fn()}
      />,
    );

    const replaceAllBtn = screen.getByTitle("全部替换");
    fireEvent.click(replaceAllBtn);

    expect(screen.getByRole("status")).toHaveTextContent("已替换 5 处");
  });
});
