import { beforeEach, describe, expect, it, vi } from "vitest";
import { editorViewCtx } from "@milkdown/kit/core";

const { html2canvasMock } = vi.hoisted(() => ({ html2canvasMock: vi.fn() }));
vi.mock("html2canvas", () => ({ default: html2canvasMock }));

import { exportPNG } from "../../src/lib/exporter";
import { useWorkspace } from "../../src/store/workspace";

function editorWith(html: string): any {
  const dom = document.createElement("div");
  dom.className = "ProseMirror";
  dom.setAttribute("contenteditable", "true");
  dom.setAttribute("role", "textbox");
  dom.innerHTML = html;
  return {
    action: (fn: (ctx: any) => unknown) => fn({
      get: (key: any) => key === editorViewCtx ? { dom } : null,
    }),
  };
}

describe("exportPNG", () => {
  beforeEach(() => {
    html2canvasMock.mockReset();
    useWorkspace.setState({ currentFile: "/notes/report.md" });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    html2canvasMock.mockResolvedValue({
      toBlob: (callback: BlobCallback) => callback(new Blob(["png"], { type: "image/png" })),
    });
  });

  it("renders the real three-level editor structure and always removes it", async () => {
    document.documentElement.setAttribute("data-theme", "dark");
    await exportPNG(() => editorWith("<h1>Report</h1><p>Body</p>"));

    expect(html2canvasMock).toHaveBeenCalledTimes(1);
    const root = html2canvasMock.mock.calls[0][0] as HTMLElement;
    expect(root.getAttribute("data-theme")).toBe("dark");
    const scroll = root.firstElementChild as HTMLElement;
    const milkdown = scroll.firstElementChild as HTMLElement;
    expect(scroll.className).toBe("editor-scroll");
    expect(milkdown.className).toBe("milkdown");
    expect(milkdown.querySelector("h1")?.textContent).toBe("Report");
    expect(root.isConnected).toBe(false);
    expect(document.body.contains(root)).toBe(false);
  });

  it("cleans the off-screen clone when html2canvas rejects", async () => {
    html2canvasMock.mockRejectedValueOnce(new Error("canvas failed"));
    await expect(exportPNG(() => editorWith("<p>Body</p>"))).rejects.toThrow("canvas failed");
    expect(document.querySelector('[style*="left: -99999px"]')).toBeNull();
  });
});
