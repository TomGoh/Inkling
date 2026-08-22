import { describe, expect, it } from "vitest";
import { sanitizeMermaidSvg } from "../../src/components/Editor/mermaid-view";

describe("Mermaid SVG DOM 清洗与命名空间校验", () => {
  it("过滤 SVG 中携带的恶意 script, iframe, object 以及各种伪协议与 on* 事件", () => {
    const maliciousSvg = `
      <svg>
        <script>alert('xss')</script>
        <iframe src="https://evil.com"></iframe>
        <object data="test.swf"></object>
        <a id="link1" href="jav&#x09;ascript:alert(1)"><text>Click</text></a>
        <a id="link2" href="jav\tascript:alert(2)"><text>Tab</text></a>
        <a id="link3" href="vbscript:msgbox(1)"><text>VBS</text></a>
        <a id="link4" href="data:text/html,<script>alert(1)</script>"><text>Data HTML</text></a>
        <a id="link5" href="data:image/svg+xml;utf8,<svg></svg>"><text>Safe Data</text></a>
        <circle cx="50" cy="50" r="40" onclick="alert('click')" />
        <animate attributeName="onload" values="alert(1)" />
        <animate attributeName="href" values="javascript:alert(1)" />
      </svg>
    `;
    const fragment = sanitizeMermaidSvg(maliciousSvg);
    const container = document.createElement("div");
    container.appendChild(fragment);

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("object")).toBeNull();

    expect(container.querySelector("#link1")?.getAttribute("href")).toBeNull();
    expect(container.querySelector("#link2")?.getAttribute("href")).toBeNull();
    expect(container.querySelector("#link3")?.getAttribute("href")).toBeNull();
    expect(container.querySelector("#link4")?.getAttribute("href")).toBeNull();
    expect(container.querySelector("#link5")?.getAttribute("href")).toBe("data:image/svg+xml;utf8,<svg></svg>");

    const circle = container.querySelector("circle");
    expect(circle?.getAttribute("onclick")).toBeNull();

    const animates = container.querySelectorAll("animate");
    expect(animates[0]?.getAttribute("attributeName")).toBeNull();
    expect(animates[1]?.getAttribute("values")).toBeNull();
  });

  it("保持 SVG 元素及 foreignObject 完整命名空间", () => {
    const svgWithForeignObject = `
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <g class="node">
          <rect width="80" height="40" fill="#fff" />
          <foreignObject width="80" height="40">
            <div xmlns="http://www.w3.org/1999/xhtml">
              <span class="nodeLabel">Process</span>
            </div>
          </foreignObject>
        </g>
      </svg>
    `;
    const fragment = sanitizeMermaidSvg(svgWithForeignObject);
    const container = document.createElement("div");
    container.appendChild(fragment);

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.namespaceURI).toBe("http://www.w3.org/2000/svg");

    const rect = container.querySelector("rect");
    expect(rect?.namespaceURI).toBe("http://www.w3.org/2000/svg");

    const fo = container.querySelector("foreignObject");
    expect(fo?.namespaceURI).toBe("http://www.w3.org/2000/svg");

    const div = container.querySelector("div");
    expect(div).not.toBeNull();
    expect(div?.querySelector("span")?.textContent).toBe("Process");
  });
});
