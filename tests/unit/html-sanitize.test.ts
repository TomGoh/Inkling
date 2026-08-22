// HTML 嵌入渲染白名单过滤测试
// 验证 sanitizeHTML 的安全过滤：白名单标签/属性/CSS 放行，危险内容拦截。

import { describe, it, expect } from "vitest";
import { sanitizeHTML } from "../../src/components/Editor/html-view";

describe("sanitizeHTML 白名单过滤", () => {
  it("行内标签 span + style 放行", () => {
    const node = sanitizeHTML('<span style="color:red">红</span>');
    const div = document.createElement("div");
    div.appendChild(node);
    const span = div.querySelector("span");
    expect(span).not.toBeNull();
    expect(span!.style.color).toBe("red");
    expect(span!.textContent).toBe("红");
  });

  it("kbd 标签放行（键盘按键样式）", () => {
    const node = sanitizeHTML("<kbd>Ctrl</kbd>");
    const div = document.createElement("div");
    div.appendChild(node);
    expect(div.querySelector("kbd")).not.toBeNull();
  });

  it("br 标签放行", () => {
    const node = sanitizeHTML("a<br>b");
    const div = document.createElement("div");
    div.appendChild(node);
    expect(div.querySelector("br")).not.toBeNull();
  });

  it("details/summary 块级标签放行", () => {
    const node = sanitizeHTML("<details><summary>标题</summary>内容</details>");
    const div = document.createElement("div");
    div.appendChild(node);
    expect(div.querySelector("details")).not.toBeNull();
    expect(div.querySelector("summary")!.textContent).toBe("标题");
  });

  it("script 标签被过滤（XSS 防御）", () => {
    // 注：happy-dom 的 DOMParser 会执行 script，用无害表达式避免测试报错；
    // 真实浏览器 DOMParser 不执行 script，生产环境更安全
    const node = sanitizeHTML("<script>1</script>safe");
    const div = document.createElement("div");
    div.appendChild(node);
    expect(div.querySelector("script")).toBeNull();
    expect(div.textContent).toBe("safe");
  });

  it("iframe 标签被过滤", () => {
    const node = sanitizeHTML("<iframe></iframe>safe");
    const div = document.createElement("div");
    div.appendChild(node);
    expect(div.querySelector("iframe")).toBeNull();
  });

  it("on* 事件属性被过滤", () => {
    const node = sanitizeHTML('<span onclick="alert(1)" onmouseover="x()">t</span>');
    const div = document.createElement("div");
    div.appendChild(node);
    const span = div.querySelector("span");
    expect(span!.getAttribute("onclick")).toBeNull();
    expect(span!.getAttribute("onmouseover")).toBeNull();
  });

  it("javascript: 协议的 href 被过滤", () => {
    const node = sanitizeHTML('<a href="javascript:alert(1)">click</a>');
    const div = document.createElement("div");
    div.appendChild(node);
    const a = div.querySelector("a");
    // href 被移除，但 a 标签保留
    expect(a).not.toBeNull();
    expect(a!.getAttribute("href")).toBeNull();
  });

  it("http/https/mailto 协议的 href 放行", () => {
    const node = sanitizeHTML('<a href="https://example.com">link</a>');
    const div = document.createElement("div");
    div.appendChild(node);
    expect(div.querySelector("a")!.getAttribute("href")).toBe("https://example.com");
  });

  it("data: 非 image 协议被过滤", () => {
    const node = sanitizeHTML('<a href="data:text/html,foo">x</a>');
    const div = document.createElement("div");
    div.appendChild(node);
    expect(div.querySelector("a")!.getAttribute("href")).toBeNull();
  });

  it("data:image 协议放行（图片）", () => {
    const node = sanitizeHTML('<img src="data:image/png;base64,iVBOR=" alt="p">');
    const div = document.createElement("div");
    div.appendChild(node);
    expect(div.querySelector("img")!.getAttribute("src")).toBe("data:image/png;base64,iVBOR=");
  });

  it("CSS expression() 注入被过滤", () => {
    const node = sanitizeHTML('<span style="width:expression(alert(1))">x</span>');
    const div = document.createElement("div");
    div.appendChild(node);
    const span = div.querySelector("span");
    // expression 被过滤后 style 为空
    expect(span!.getAttribute("style")).toBeNull();
  });

  it("非白名单 CSS 属性被过滤", () => {
    const node = sanitizeHTML('<span style="position:fixed;color:red">x</span>');
    const div = document.createElement("div");
    div.appendChild(node);
    const span = div.querySelector("span");
    // position 不在白名单，color 在
    expect(span!.style.position).toBe("");
    expect(span!.style.color).toBe("red");
  });

  it("非白名单标签被过滤（如 object/embed）", () => {
    const node = sanitizeHTML('<object data="evil"></object>safe');
    const div = document.createElement("div");
    div.appendChild(node);
    expect(div.querySelector("object")).toBeNull();
    expect(div.textContent).toBe("safe");
  });

  it("嵌套结构递归过滤", () => {
    const node = sanitizeHTML(
      '<div class="box"><span style="color:blue"><script>1</script>text</span></div>',
    );
    const div = document.createElement("div");
    div.appendChild(node);
    expect(div.querySelector("div.box")).not.toBeNull();
    expect(div.querySelector("span")!.style.color).toBe("blue");
    expect(div.querySelector("script")).toBeNull();
    expect(div.textContent).toBe("text");
  });

  it("相同 value 命中缓存（返回克隆）", () => {
    const v = '<span class="c">x</span>';
    const n1 = sanitizeHTML(v);
    const n2 = sanitizeHTML(v);
    // 克隆：不是同一引用
    expect(n1).not.toBe(n2);
    // 但内容一致
    const d1 = document.createElement("div");
    const d2 = document.createElement("div");
    d1.appendChild(n1);
    d2.appendChild(n2);
    expect(d1.innerHTML).toBe(d2.innerHTML);
  });

  it("空字符串返回空 fragment", () => {
    const node = sanitizeHTML("");
    expect(node.childNodes.length).toBe(0);
  });

  it("SVG 标签及属性放行且使用 SVG 命名空间创建", () => {
    const svgCode = '<svg viewBox="0 0 100 100" width="100"><circle cx="50" cy="50" r="40" fill="red" /></svg>';
    const node = sanitizeHTML(svgCode);
    const div = document.createElement("div");
    div.appendChild(node);
    const svg = div.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("viewBox")).toBe("0 0 100 100");
    expect(svg!.namespaceURI).toBe("http://www.w3.org/2000/svg");
    const circle = div.querySelector("circle");
    expect(circle).not.toBeNull();
    expect(circle!.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(circle!.getAttribute("fill")).toBe("red");
  });

  it("纯文本放行", () => {
    const node = sanitizeHTML("hello world");
    const div = document.createElement("div");
    div.appendChild(node);
    expect(div.textContent).toBe("hello world");
  });
});
