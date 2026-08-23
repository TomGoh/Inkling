import { describe, it, expect } from "vitest";
import { sanitizeHTML, unescapeCss } from "../../src/components/Editor/html-view";

describe("Issue #86: HTML sanitize security against <style>, external CSS and xlink:href", () => {
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

  it("should block CSS hex/unicode escape bypasses like u\\72 l()", () => {
    expect(unescapeCss("u\\72 l(//evil.com/t.gif)")).toContain("url(");
    expect(unescapeCss("u\\000072l(//evil.com/t.gif)")).toContain("url(");
    expect(unescapeCss("ex/*comment*/pression(alert(1))")).toContain("expression(");

    const node = sanitizeHTML(`<div style="background-image: u\\72 l(//evil.com/leak.gif);">Sneaky</div>`);
    const container = document.createElement("div");
    container.appendChild(node);
    const el = container.querySelector("div");
    expect(el?.hasAttribute("style")).toBe(false);
  });

  it("should filter malicious xlink:href on SVG elements while keeping safe URLs", () => {
    const malicious = sanitizeHTML(`<svg><use xlink:href="javascript:alert(1)"></use></svg>`);
    const container1 = document.createElement("div");
    container1.appendChild(malicious);
    const use1 = container1.querySelector("use");
    expect(use1?.hasAttribute("xlink:href")).toBe(false);

    const safe = sanitizeHTML(`<svg><use xlink:href="#my-symbol"></use></svg>`);
    const container2 = document.createElement("div");
    container2.appendChild(safe);
    const use2 = container2.querySelector("use");
    expect(use2?.getAttribute("xlink:href")).toBe("#my-symbol");
  });
});
