// Mermaid 图表渲染
// 拦截语言为 mermaid 的代码块，渲染为 SVG 图表而非 CodeMirror 高亮。
// markdown 源码保持 ```mermaid 代码块，便于迁移和版本控制。
// 由 code-block-view 在创建 CodeMirror 视图前判断 language 调用本模块渲染。
//
// 编辑入口：点击右上角「编辑」按钮或双击图表（缩放为 100% 时）→ 切换到 textarea 编辑源码；
// 失焦或 Ctrl/Cmd+Enter 提交并重新渲染，Esc 放弃修改。
//
// 下载：点击「下载」按钮导出 SVG 文件（桌面端弹保存对话框，浏览器端直接下载）。
// 缩放：鼠标悬停图表时 Ctrl/Cmd+滚轮缩放 SVG（0.5~3x），不触发文档缩放。
// 平移：缩放大于 100% 时，按住鼠标拖动平移图表查看各区域；双击重置缩放与平移。
//
// 性能（v2.3.1）：图表延迟到进入视口（含 300px 预载边距）时才渲染。
// 万行文档可含数十张图，打开即全量渲染会让主线程连续阻塞近 10 秒
// （每张 ~150ms），期间滚动/输入全部冻结；视口外仅保留占位容器。
//
// 性能（v2.3.2）：仅懒渲染会把渲染开销转移到滚动时（滚到未渲染图表
// 处逐张 ~150ms 卡顿）。新增空闲预渲染：打开文档后视口外的图表按
// 文档顺序排入队列，requestIdleCallback 空闲时段逐张后台渲染——
// 打开快、滚动也顺（通常滚到前已预渲染完），滚得快时仍即时渲染兜底。

import type { NodeView } from "@milkdown/kit/prose/view";
import type { Node } from "@milkdown/kit/prose/model";
import type { EditorView as PMView } from "@milkdown/kit/prose/view";
import { isTauri } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeBinaryFile } from "../../lib/fs";
import mermaid from "mermaid";

// 初始化一次 Mermaid 运行时
//
// 关键配置说明（v2.0.1 防多行节点文字底部裁切）：
// - flowchart.htmlLabels: true —— 保留 <br/> 多行换行能力
// - flowchart.padding: 20 —— 节点内边距加大（默认 15），给多行文字留呼吸空间
// - flowchart.useMaxWidth: false —— 不按容器宽度缩放回流，避免宽度变化触发高度重算偏差
// - themeVariables.fontSize —— 锁定字号，避免继承编辑器大字号导致测量与渲染不一致
// 配合 App.css 中对 .mermaid .nodeLabel 的 line-height 锁定（1.25），
// 使 mermaid 测量阶段与最终渲染阶段的文字高度一致，rect 不再偏矮、文字不再溢出底边。
export const MERMAID_CONFIG = {
  startOnLoad: false,
  theme: "default",
  securityLevel: "strict",
  flowchart: {
    htmlLabels: true,
    padding: 20,
    useMaxWidth: false,
  },
  themeVariables: {
    fontSize: "14px",
  },
} as const;

let initialized = false;
function ensureInit() {
  if (initialized) return;
  mermaid.initialize(MERMAID_CONFIG);
  initialized = true;
}

/** 递增的图表 id，保证多图表互不冲突 */
let diagramSeq = 0;

/**
 * 空闲预渲染队列（v2.3.2）：视口外图表按创建（文档）顺序排队，
 * requestIdleCallback 逐张后台渲染，每张渲染 ~150ms 超出单帧预算，
 * 每个空闲槽只渲染一张，避免连续阻塞。
 */
const idleRenderQueue: Array<() => void> = [];
let idlePumpScheduled = false;
/** 最近一次滚动时间：滚动进行中暂停后台预渲染，避免与滚动争抢主线程 */
let lastScrollAt = 0;
let scrollMarkInstalled = false;
function ensureScrollMark(): void {
  if (scrollMarkInstalled) return;
  scrollMarkInstalled = true;
  document.addEventListener(
    "scroll",
    () => {
      lastScrollAt = performance.now();
    },
    { passive: true, capture: true },
  );
}
function pumpIdleRenderQueue(): void {
  if (idlePumpScheduled) return;
  idlePumpScheduled = true;
  const run = () => {
    idlePumpScheduled = false;
    const task = idleRenderQueue.shift();
    if (!task) return;
    task();
    if (idleRenderQueue.length) pumpIdleRenderQueue();
  };
  const schedule = () => {
    // 滚动停歇 250ms 后才继续预渲染，滚动中只让位给视口即时渲染
    if (performance.now() - lastScrollAt < 250 && idleRenderQueue.length) {
      setTimeout(schedule, 250);
      return;
    }
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(run);
    } else {
      setTimeout(run, 64);
    }
  };
  ensureScrollMark();
  schedule();
}

/** Mermaid 缩放范围与步进 */
const MERMAID_ZOOM_MIN = 0.5;
const MERMAID_ZOOM_MAX = 3;
const MERMAID_ZOOM_STEP = 0.1;
const MERMAID_ZOOM_DEFAULT = 1;

/**
 * 下载 Mermaid SVG 字符串为文件。
 * 桌面端走保存对话框 + writeBinary_file；浏览器端用 a 标签触发下载。
 */
async function downloadSvgFile(svg: string): Promise<void> {
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `mermaid-${stamp}.svg`;
  if (isTauri()) {
    const path = await save({
      defaultPath: filename,
      filters: [{ name: "SVG", extensions: ["svg"] }],
    });
    if (!path) return;
    const buf = new Uint8Array(await blob.arrayBuffer());
    await writeBinaryFile(path, buf);
  } else {
    // 浏览器端：a 标签触发下载
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

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

  // 工具栏：编辑 + 下载按钮（hover 显现）
  const toolbar = document.createElement("div");
  toolbar.className = "mermaid-toolbar";
  toolbar.contentEditable = "false";
  container.appendChild(toolbar);

  const editBtn = document.createElement("button");
  editBtn.className = "mermaid-edit-btn";
  editBtn.type = "button";
  editBtn.textContent = "编辑";
  toolbar.appendChild(editBtn);

  const downloadBtn = document.createElement("button");
  downloadBtn.className = "mermaid-download-btn";
  downloadBtn.type = "button";
  downloadBtn.textContent = "下载";
  downloadBtn.title = "下载为 SVG 文件";
  toolbar.appendChild(downloadBtn);

  // 源码编辑器（textarea，默认隐藏）
  const editor = document.createElement("textarea");
  editor.className = "mermaid-editor";
  editor.spellcheck = false;
  editor.placeholder = "输入 Mermaid 图表代码（如 graph TD; A-->B）";
  editor.style.display = "none";
  container.appendChild(editor);

  let current = node;
  let lastValue = "__init__";
  let lastSvg = ""; // 缓存最近一次成功渲染的 SVG 字符串，供下载使用
  let editing = false;
  let zoom = MERMAID_ZOOM_DEFAULT; // 当前缩放倍率
  let panX = 0; // 平移 X（像素，缩放后坐标系）
  let panY = 0; // 平移 Y

  /** 应用缩放与平移到 SVG 元素（transform 不触发布局重排，性能好） */
  const applyZoom = () => {
    const svg = diagram.querySelector("svg");
    if (!svg) return;
    svg.style.transformOrigin = "center";
    // translate 叠加在 scale 之上：先以中心缩放，再整体平移 panX/panY
    svg.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    // zoomable：可缩放（Ctrl+滚轮）；pannable：可拖动（zoom > 1）
    diagram.classList.toggle("zoomable", true);
    diagram.classList.toggle("pannable", zoom > MERMAID_ZOOM_DEFAULT);
  };

  /** 重置缩放与平移到默认值 */
  const resetZoomPan = () => {
    zoom = MERMAID_ZOOM_DEFAULT;
    panX = 0;
    panY = 0;
    applyZoom();
  };

  const render = async (value: string) => {
    if (value === lastValue) return;
    lastValue = value;
    if (!value.trim()) {
      diagram.innerHTML = "";
      lastSvg = "";
      diagram.setAttribute("data-placeholder", "输入 Mermaid 图表代码");
      return;
    }
    try {
      const id = `mermaid-svg-${diagramSeq++}`;
      const { svg } = await mermaid.render(id, value);
      diagram.innerHTML = svg;
      lastSvg = svg;
      // 重新渲染后重置平移（图表尺寸变了，旧平移量无意义），保留缩放
      panX = 0;
      panY = 0;
      applyZoom();
    } catch (e) {
      // 渲染失败时显示错误信息，保留源码可见
      const msg = (e as Error).message || String(e);
      diagram.innerHTML = `<pre class="mermaid-error">${
        msg.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      }</pre>`;
      lastSvg = "";
    }
  };

  // 视口懒渲染 + 空闲预渲染（v2.3.2）：
  // - 进入视口（含 300px 预载边距）→ 立即渲染，保证滚到即见；
  // - 视口外 → 排入空闲队列后台逐张预渲染，避免滚动到时才渲染卡顿；
  // - IntersectionObserver 不可用（如 jsdom 单测环境）时退回立即渲染。
  let firstRenderDone = false;
  const renderFirst = () => {
    if (firstRenderDone) return;
    firstRenderDone = true;
    io?.disconnect();
    io = null;
    // 用最新节点内容渲染（视口外内容变更只更新 current，不渲染）
    void render(current.textContent);
  };
  let io: IntersectionObserver | null = null;
  if (typeof IntersectionObserver === "undefined") {
    renderFirst();
  } else {
    io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        renderFirst();
      },
      { rootMargin: "300px" },
    );
    io.observe(container);
    // 尚未进入视口：排入空闲预渲染队列（按文档顺序），后台逐张渲染。
    // 已被视口路径渲染过或容器已销毁（切文档）时自动跳过。
    idleRenderQueue.push(() => {
      if (!firstRenderDone && container.isConnected) renderFirst();
    });
    pumpIdleRenderQueue();
  }

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
  downloadBtn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  downloadBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!lastSvg) return;
    await downloadSvgFile(lastSvg);
  });
  container.addEventListener("dblclick", (e) => {
    // 双击图表区域：
    // - 已放大（zoom > 1）时重置缩放与平移到 100%
    // - 未放大时进入编辑模式
    e.preventDefault();
    e.stopPropagation();
    if (editing) return;
    if (zoom > MERMAID_ZOOM_DEFAULT) {
      resetZoomPan();
      return;
    }
    enterEdit();
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

  // Ctrl/Cmd+滚轮缩放图表：阻止冒泡，避免触发文档缩放
  // 仅在非编辑模式响应；编辑模式让 textarea 正常滚动
  container.addEventListener("wheel", (e) => {
    if (editing) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    e.stopPropagation();
    const next = e.deltaY < 0 ? zoom + MERMAID_ZOOM_STEP : zoom - MERMAID_ZOOM_STEP;
    zoom = Math.min(MERMAID_ZOOM_MAX, Math.max(MERMAID_ZOOM_MIN, Math.round(next * 10) / 10));
    applyZoom();
  }, { passive: false });

  // 拖动平移：缩放大于 100% 时，按住鼠标拖动图表查看各区域。
  // 仅在非编辑模式响应；mousedown 阻止冒泡防止 ProseMirror 抢焦点/选中文本。
  // mousemove/mouseup 挂在 window 上，避免拖出图表区域后失效。
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let panStartX = 0;
  let panStartY = 0;

  const onMouseMove = (e: MouseEvent) => {
    if (!dragging) return;
    panX = panStartX + (e.clientX - dragStartX);
    panY = panStartY + (e.clientY - dragStartY);
    applyZoom();
  };
  const onMouseUp = () => {
    if (!dragging) return;
    dragging = false;
    diagram.classList.remove("dragging");
  };

  diagram.addEventListener("mousedown", (e) => {
    if (editing) return;
    // 仅放大时可拖动（zoom = 1 时图表完整显示，拖动无意义）
    if (zoom <= MERMAID_ZOOM_DEFAULT) return;
    // 排除点击工具栏按钮等子元素
    if ((e.target as HTMLElement).closest(".mermaid-toolbar")) return;
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    panStartX = panX;
    panStartY = panY;
    diagram.classList.add("dragging");
  });
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);

  return {
    dom: container,
    update: (next: Node) => {
      if (next.type !== current.type) return false;
      if (next.attrs.language !== "mermaid") return false;
      current = next;
      // 编辑中不覆盖编辑器内容，避免打断输入；
      // 尚未进入视口（io 未清空）时也不渲染，待可见后以最新内容首次渲染
      if (!editing && !io) void render(next.textContent);
      return true;
    },
    // 仅编辑模式下拦截事件（避免 ProseMirror 抢 textarea 焦点）；
    // 非编辑模式不拦截，使节点可被选中后用 Backspace/Delete 删除
    stopEvent: () => editing,
    ignoreMutation: () => true,
    destroy: () => {
      // 断开视口观察，清理 window 上的拖动监听器，避免内存泄漏
      io?.disconnect();
      io = null;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    },
  };
}
