import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DeletedSnapshots } from "../../src/components/Sidebar/DeletedSnapshots";
import * as shared from "../../src/store/workspace/shared";
import * as dialogs from "../../src/lib/dialogs";

vi.mock("../../src/lib/dialogs", () => ({
  askConfirmation: vi.fn(),
  showMessage: vi.fn(),
}));

describe("DeletedSnapshots clear confirmation (#129)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks confirmation before clearing all snapshots and cancels if rejected", async () => {
    vi.spyOn(shared, "loadDeletedSnapshots").mockReturnValue([
      { path: "/path/to/a.md", content: "hello", deletedAt: Date.now() },
    ]);
    const clearSpy = vi.spyOn(shared, "clearDeletedSnapshots").mockImplementation(() => {});
    vi.mocked(dialogs.askConfirmation).mockResolvedValue(false);

    render(<DeletedSnapshots />);

    const clearBtn = screen.getByTitle("清除全部备份");
    fireEvent.click(clearBtn);

    expect(dialogs.askConfirmation).toHaveBeenCalledWith(
      expect.stringContaining("确定要清除全部 1 个备份快照吗"),
      expect.objectContaining({ kind: "warning" }),
    );
    expect(clearSpy).not.toHaveBeenCalled();
  });

  it("clears snapshots when user confirms", async () => {
    vi.spyOn(shared, "loadDeletedSnapshots").mockReturnValue([
      { path: "/path/to/a.md", content: "hello", deletedAt: Date.now() },
    ]);
    const clearSpy = vi.spyOn(shared, "clearDeletedSnapshots").mockImplementation(() => {});
    vi.mocked(dialogs.askConfirmation).mockResolvedValue(true);

    render(<DeletedSnapshots />);

    const clearBtn = screen.getByTitle("清除全部备份");
    await fireEvent.click(clearBtn);

    expect(clearSpy).toHaveBeenCalled();
  });
});
