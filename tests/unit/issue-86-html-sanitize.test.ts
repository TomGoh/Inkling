import { describe, it, expect } from "vitest";
import { sanitizeHTML } from "../../src/components/Editor/html-view";

describe("Issue #86: HTML sanitize security against <style> and external CSS", () => {
  it("should drop <style> tags completely", () => {
    const node = sanitizeHTML("<div><style>body { background: red; }</style><p>Hello</p></div>");
    const container = document.createElement("div");
    container.appendChild(node);
    expect(container.querySelector("style")).toBeNull();
    expect(container.querySelector("p")?.textContent).toBe("Hello");
  });

  it("should sanitize dangerous style attributes (urls, expressions)", () => {
    const node = sanitizeHTML(`<div style="color: red; background-image: url(http://evil.com/leak);">Text</div>`);
    const container = document.createElement("div");
    container.appendChild(node);
    const el = container.querySelector("div");
    expect(el?.getAttribute("style")).not.toContain("url(");
  });
});
