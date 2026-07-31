// Mermaid 图表渲染
// 拦截语言为 mermaid 的代码块，渲染为 SVG 图表而非 CodeMirror 高亮。
// markdown 源码保持 ```mermaid 代码块，便于迁移和版本控制。
// 由 code-block-view 在创建 CodeMirror 视图前判断 language 调用本模块渲染。
//
// 编辑入口：点击右上角「编辑」按钮或双击图表 → 切换到 textarea 编辑源码；
// 失焦或 Ctrl/Cmd+Enter 提交并重新渲染，Esc 放弃修改。

import type { NodeView } from "@milkdown/kit/prose/view";
import type { Node } from "@milkdown/kit/prose/model";
import type { EditorView as PMView } from "@milkdown/kit/prose/view";
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
export function createMermaidView(
  node: Node,
  view: PMView,
  getPos: () => number | undefined,
): NodeView {
  ensureInit();

  const container = document.createElement("div");
  container.className = "mermaid-block";
  container.setAttribute("data-mermaid", "");

  const diagram = document.createElement("div");
  diagram.className = "mermaid-render";
  container.appendChild(diagram);

  // 编辑按钮（contentEditable=false，不参与文档编辑）
  const editBtn = document.createElement("button");
  editBtn.className = "mermaid-edit-btn";
  editBtn.type = "button";
  editBtn.contentEditable = "false";
  editBtn.textContent = "编辑";
  container.appendChild(editBtn);

  // 源码编辑器（textarea，默认隐藏）
  const editor = document.createElement("textarea");
  editor.className = "mermaid-editor";
  editor.spellcheck = false;
  editor.placeholder = "输入 Mermaid 图表代码（如 graph TD; A-->B）";
  editor.style.display = "none";
  container.appendChild(editor);

  let current = node;
  let lastValue = "__init__";
  let editing = false;

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

  const enterEdit = () => {
    if (editing) return;
    editing = true;
    editor.value = current.textContent;
    editor.style.display = "block";
    diagram.style.display = "none";
    editBtn.textContent = "完成";
    // 延迟聚焦以确保已可见
    requestAnimationFrame(() => editor.focus());
  };

  const exitEdit = (commit: boolean) => {
    if (!editing) return;
    editing = false;
    editor.style.display = "none";
    diagram.style.display = "";
    editBtn.textContent = "编辑";
    if (!commit) {
      // 放弃修改，按当前节点内容重新渲染
      lastValue = "__force__";
      void render(current.textContent);
      return;
    }
    const newValue = editor.value;
    if (newValue === current.textContent) {
      lastValue = "__force__";
      void render(newValue);
      return;
    }
    // 写回 code_block 节点的文本内容
    const pos = getPos();
    if (pos == null) {
      lastValue = "__force__";
      void render(newValue);
      return;
    }
    const start = pos + 1; // 节点内容起始（跳过节点本身的开标签）
    const end = pos + current.nodeSize - 1; // 节点内容结束
    const schema = view.state.schema;
    const text = newValue ? schema.text(newValue) : null;
    const tr = text
      ? view.state.tr.replaceWith(start, end, text)
      : view.state.tr.delete(start, end);
    view.dispatch(tr);
  };

  editBtn.addEventListener("mousedown", (e) => {
    // 阻止 ProseMirror 抢焦点
    e.preventDefault();
    e.stopPropagation();
  });
  editBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (editing) exitEdit(true);
    else enterEdit();
  });
  container.addEventListener("dblclick", (e) => {
    // 双击图表区域进入编辑
    e.preventDefault();
    e.stopPropagation();
    if (!editing) enterEdit();
  });
  editor.addEventListener("blur", () => exitEdit(true));
  editor.addEventListener("keydown", (e) => {
    // Ctrl/Cmd+Enter 提交
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      exitEdit(true);
      return;
    }
    // Esc 放弃修改
    if (e.key === "Escape") {
      e.preventDefault();
      exitEdit(false);
    }
  });

  return {
    dom: container,
    update: (next: Node) => {
      if (next.type !== current.type) return false;
      if (next.attrs.language !== "mermaid") return false;
      current = next;
      // 编辑中不覆盖编辑器内容，避免打断输入
      if (!editing) void render(next.textContent);
      return true;
    },
    // 仅编辑模式下拦截事件（避免 ProseMirror 抢 textarea 焦点）；
    // 非编辑模式不拦截，使节点可被选中后用 Backspace/Delete 删除
    stopEvent: () => editing,
    ignoreMutation: () => true,
  };
}
