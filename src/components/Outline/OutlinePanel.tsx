// 大纲面板
// 解析当前文档的标题，生成可点击的目录树。
// 点击标题 → 滚动编辑器到对应标题位置。
// 当前光标所在标题高亮（由 outline-tracker 插件更新 store）。

import { useMemo } from "react";
import type { Editor } from "@milkdown/kit/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { TextSelection } from "@milkdown/kit/prose/state";
import { parseOutline, slugify } from "../../lib/outline";
import { useWorkspace } from "../../store/workspace";
import "./OutlinePanel.css";

interface OutlinePanelProps {
  /** 获取 Milkdown 编辑器实例，用于滚动定位 */
  getEditor: () => Editor | undefined;
}

/** 滚动编辑器到 slug 匹配的标题节点 */
function scrollToHeading(getEditor: () => Editor | undefined, slug: string) {
  const editor = getEditor();
  if (!editor) return;
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const doc = view.state.doc;
    let foundPos: number | null = null;
    doc.descendants((node, pos) => {
      if (node.type.name === "heading") {
        if (slugify(node.textContent) === slug) {
          foundPos = pos;
          return false;
        }
      }
      return true;
    });
    if (foundPos != null) {
      // 滚动标题 DOM 到视图顶部
      const dom = view.nodeDOM(foundPos);
      if (dom instanceof HTMLElement) {
        dom.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      // 同时把光标移到标题，便于后续编辑
      const sel = TextSelection.near(doc.resolve(foundPos + 1));
      view.dispatch(view.state.tr.setSelection(sel));
      view.focus();
    }
  });
}

export function OutlinePanel({ getEditor }: OutlinePanelProps) {
  const currentContent = useWorkspace((s) => s.currentContent);
  const currentHeadingSlug = useWorkspace((s) => s.currentHeadingSlug);

  const headings = useMemo(
    () => parseOutline(currentContent),
    [currentContent],
  );

  return (
    <aside className="outline-panel">
      <div className="outline-header">
        <span className="outline-title">大纲</span>
      </div>
      <div className="outline-tree">
        {headings.length === 0 ? (
          <div className="outline-empty">文档暂无标题</div>
        ) : (
          headings.map((h) => {
            const slug = slugify(h.text);
            const active = slug === currentHeadingSlug;
            return (
              <button
                key={h.id}
                className={`outline-item outline-h${h.level}${active ? " outline-item-active" : ""}`}
                style={{ paddingLeft: `${(h.level - 1) * 12 + 8}px` }}
                title={h.text}
                onClick={() => scrollToHeading(getEditor, slug)}
              >
                <span className="outline-item-text">{h.text}</span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}

export default OutlinePanel;
