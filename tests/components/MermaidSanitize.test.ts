import { describe, expect, it } from "vitest";
import { sanitizeMermaidSvg } from "../../src/components/Editor/mermaid-view";

describe("Mermaid SVG DOMPurify 清洗安全校验", () => {
  it("过滤 SVG 中携带的恶意 script 标签与 javascript 伪协议", () => {
    const maliciousSvg = `<svg><script>alert('xss')</script><a href="javascript:alert(1)"><text>Click</text></a></svg>`;
    const fragment = sanitizeMermaidSvg(maliciousSvg);
    const container = document.createElement("div");
    container.appendChild(fragment);

    expect(container.querySelector("script")).toBeNull();
    const link = container.querySelector("a");
    if (link) {
      expect(link.getAttribute("href")).toBeNull();
    }
  });

  it("正常 SVG 元素与图形属性保留", () => {
    const safeSvg = `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" stroke="green" stroke-width="4" fill="yellow" /><text x="10" y="20">Hello</text></svg>`;
    const fragment = sanitizeMermaidSvg(safeSvg);
    const container = document.createElement("div");
    container.appendChild(fragment);

    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector("circle")).not.toBeNull();
    expect(container.querySelector("text")?.textContent).toBe("Hello");
  });
});
