// 块拖拽排序：段落/标题/列表/引用/代码块等顶层块节点左侧出现 ⋮⋮ 手柄，
// 按住手柄拖动可整块重排。基于 ProseMirror Decoration（widget 手柄）+ HTML5 DnD。
//
// 实现要点：
// - 每个顶层块节点用 Decoration.widget 在其起始位置插入一个手柄 span
// - 手柄 data-block-pos 记录块在文档中的起始位置（拖拽时读取）
// - dragstart：找到该位置所属的顶层块节点，设置 dataTransfer 携带块信息，
//   并构造该块的 DOM 副本作为拖拽预览
// - dragover：preventDefault 允许 drop，根据指针位置决定插入「之前」或「之后」，
//   用一个 drop-indicator 装饰高亮目标位置
// - drop：从源文档删除原块，在目标位置重新插入，单个 transaction 完成移动

import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { EditorView } from "@milkdown/kit/prose/view";

export const blockDragKey = new PluginKey("inkling-block-drag");

/** 创建手柄 DOM */
function createHandle(pos: number): HTMLElement {
  const handle = document.createElement("span");
  handle.className = "inkling-block-handle";
  handle.contentEditable = "false";
  handle.draggable = true;
  handle.title = "拖拽排序";
  handle.dataset.blockPos = String(pos);
  handle.textContent = "⋮⋮";
  return handle;
}

/** 找到 pos 所在的顶层块节点（doc 的直接子节点） */
function topLevelBlockAt(view: EditorView, pos: number) {
  const { doc } = view.state;
  let startPos = 0;
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i);
    const end = startPos + child.nodeSize;
    if (pos >= startPos && pos < end) {
      return { node: child, pos: startPos, index: i };
    }
    startPos = end;
  }
  return null;
}

interface BlockDragState {
  /** 当前拖拽中 drop 指示器的目标位置（块索引），null 表示无 */
  dropIndex: number | null;
}

export const blockDragPlugin = () =>
  new Plugin({
    key: blockDragKey,
    state: {
      init: (): BlockDragState => ({ dropIndex: null }),
      apply: (tr, value): BlockDragState => {
        // drop-indicator 装饰通过 meta 控制
        const meta = tr.getMeta(blockDragKey);
        if (meta && typeof meta.dropIndex === "number") {
          return { dropIndex: meta.dropIndex };
        }
        if (meta && meta.clear) return { dropIndex: null };
        return value;
      },
    },
    props: {
      decorations: (state) => {
        const { dropIndex } = blockDragKey.getState(state) as BlockDragState;
        const decos: Decoration[] = [];

        // 每个顶层块起始位置插入手柄
        let pos = 0;
        const blockStarts: number[] = [];
        state.doc.forEach((child) => {
          blockStarts.push(pos);
          // 手柄 widget 用 side=-1 确保在块内容前
          decos.push(
            Decoration.widget(pos, () => createHandle(pos), { side: -1 }),
          );
          pos += child.nodeSize;
        });

        // drop 指示器：在目标块索引前插入一条横线
        if (dropIndex != null && dropIndex >= 0 && dropIndex <= blockStarts.length) {
          const indicatorPos =
            dropIndex < blockStarts.length
              ? blockStarts[dropIndex]
              : state.doc.content.size;
          decos.push(
            Decoration.widget(
              indicatorPos,
              () => {
                const line = document.createElement("div");
                line.className = "inkling-drop-indicator";
                line.contentEditable = "false";
                return line;
              },
              { side: -1 },
            ),
          );
        }
        return DecorationSet.create(state.doc, decos);
      },
      // 手柄的拖拽事件在 handleDOMEvents 里统一处理
      handleDOMEvents: {
        dragstart: (view, event: Event) => {
          const e = event as DragEvent;
          const target = e.target as HTMLElement;
          if (!target?.classList.contains("inkling-block-handle")) return false;
          const pos = Number(target.dataset.blockPos);
          if (Number.isNaN(pos)) return false;
          const block = topLevelBlockAt(view, pos);
          if (!block) return false;
          // 携带块在文档中的起始位置和大小，drop 时用
          e.dataTransfer?.setData(
            "application/x-inkling-block",
            JSON.stringify({ pos: block.pos, size: block.node.nodeSize }),
          );
          // 拖拽预览：用该块的 DOM 副本
          try {
            const dom = view.nodeDOM(block.pos) as HTMLElement | null;
            if (dom && e.dataTransfer) {
              e.dataTransfer.setDragImage(dom, 0, 0);
            }
          } catch {
            // 忽略
          }
          return true;
        },
        dragover: (view, event: Event) => {
          const e = event as DragEvent;
          if (!e.dataTransfer?.types.includes("application/x-inkling-block")) {
            return false;
          }
          e.preventDefault();
          // 计算目标块索引：根据指针位置所在块及相对块中点决定前后
          const pos = view.posAtCoords({ left: e.clientX, top: e.clientY });
          if (!pos) return true;
          const block = topLevelBlockAt(view, pos.pos);
          if (!block) return true;
          let dropIndex = block.index;
          // 若指针在该块后半段，插到其后
          const blockMid = block.pos + block.node.nodeSize / 2;
          if (pos.pos > blockMid) dropIndex = block.index + 1;
          const cur = blockDragKey.getState(view.state) as BlockDragState;
          if (cur.dropIndex !== dropIndex) {
            view.dispatch(view.state.tr.setMeta(blockDragKey, { dropIndex }));
          }
          return true;
        },
        drop: (view, event: Event) => {
          const e = event as DragEvent;
          const data = e.dataTransfer?.getData("application/x-inkling-block");
          if (!data) return false;
          e.preventDefault();
          let src: { pos: number; size: number };
          try {
            src = JSON.parse(data);
          } catch {
            return false;
          }
          const cur = blockDragKey.getState(view.state) as BlockDragState;
          const dropIndex = cur.dropIndex ?? 0;

          // 计算目标位置（块索引 → 文档位置）：累加前 dropIndex 个块的大小
          let targetPos = 0;
          let idx = 0;
          view.state.doc.forEach((child) => {
            if (idx >= dropIndex) return;
            targetPos += child.nodeSize;
            idx++;
          });

          const { tr } = view.state;
          // 取出源块节点
          const srcNode = view.state.doc.nodeAt(src.pos);
          if (!srcNode) {
            view.dispatch(tr.setMeta(blockDragKey, { clear: true }));
            return true;
          }
          // 删除源块。删除会导致后续位置偏移，需重算目标位置。
          tr.delete(src.pos, src.pos + src.size);
          // 删除后目标位置修正
          let adjustedTarget = targetPos;
          if (src.pos < targetPos) adjustedTarget -= src.size;
          // 插入源块到目标位置
          tr.insert(adjustedTarget, srcNode);
          view.dispatch(tr.setMeta(blockDragKey, { clear: true }));
          return true;
        },
        dragend: (view) => {
          const cur = blockDragKey.getState(view.state) as BlockDragState;
          if (cur.dropIndex != null) {
            view.dispatch(view.state.tr.setMeta(blockDragKey, { clear: true }));
          }
          return false;
        },
      },
    },
  });
