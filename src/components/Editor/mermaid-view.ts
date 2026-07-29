// Mermaid 图表渲染
// 拦截语言为 mermaid 的代码块，渲染为 SVG 图表而非 CodeMirror 高亮。
// markdown 源码保持 ```mermaid 代码块，便于迁移和版本控制。
// 由 code-block-view 在创建 CodeMirror 视图前判断 language 调用本模块渲染。

import type { NodeView } from "@milkdown/kit/prose/view";
import type { Node } from "@milkdown/kit/prose/model";
import mermaid from "mermaid";

// 初始化一次 Mermaid 运行时
let initialized = false;
function ensureInit() {
  if (initialized) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: "default",
    securityLevel: "strict",
  });
  initialized = true;
}

/** 递增的图表 id，保证多图表互不冲突 */
let diagramSeq = 0;

/**
 * 创建 Mermaid 图表 NodeView。
 * 调用方需先判断 node.attrs.language === "mermaid"。
 */
export function createMermaidView(node: Node): NodeView {
  ensureInit();

  const container = document.createElement("div");
  container.className = "mermaid-block";
  container.setAttribute("data-mermaid", "");

  const diagram = document.createElement("div");
  diagram.className = "mermaid-render";
  container.appendChild(diagram);

  let current = node;
  let lastValue = "";

  const render = async (value: string) => {
    if (value === lastValue) return;
    lastValue = value;
    if (!value.trim()) {
      diagram.innerHTML = "";
      diagram.setAttribute("data-placeholder", "输入 Mermaid 图表代码");
      return;
    }
    try {
      const id = `mermaid-svg-${diagramSeq++}`;
      const { svg } = await mermaid.render(id, value);
      diagram.innerHTML = svg;
    } catch (e) {
      // 渲染失败时显示错误信息，保留源码可见
      const msg = (e as Error).message || String(e);
      diagram.innerHTML = `<pre class="mermaid-error">${
        msg.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      }</pre>`;
    }
  };

  void render(current.textContent);

  return {
    dom: container,
    update: (next: Node) => {
      if (next.type !== current.type) return false;
      if (next.attrs.language !== "mermaid") return false;
      current = next;
      void render(next.textContent);
      return true;
    },
    stopEvent: () => true,
    ignoreMutation: () => true,
  };
}
