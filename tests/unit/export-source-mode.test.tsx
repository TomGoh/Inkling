import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExportMenu } from "../../src/components/Topbar/ExportMenu";
import { useWorkspace } from "../../src/store/workspace";
import * as exporter from "../../src/lib/exporter";

vi.mock("../../src/lib/exporter", () => ({
  exportMarkdown: vi.fn(),
  exportHtml: vi.fn(),
  exportPdf: vi.fn(),
  exportDocx: vi.fn().mockResolvedValue({ ok: true }),
  exportOutline: vi.fn(),
  copyMarkdown: vi.fn(),
  copyHtml: vi.fn(),
}));

describe("ExportMenu in sourceMode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspace.setState({
      currentFile: "/notes/test.md",
      currentContent: "# Test Document",
    });
  });

  it("allows exportDocx even when sourceMode is true", async () => {
    const onOpenChange = vi.fn();
    render(
      <ExportMenu
        open={true}
        onOpenChange={onOpenChange}
        sourceMode={true}
        getEditor={() => undefined}
      />,
    );

    const docxBtn = screen.getByText(/导出 Word/);
    fireEvent.click(docxBtn);

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(exporter.exportDocx).toHaveBeenCalled();
  });
});
