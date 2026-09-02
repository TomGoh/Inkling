import { useEffect, useRef, useState } from "react";
import type { Editor } from "@milkdown/kit/core";
import { editorViewCtx } from "@milkdown/kit/core";
import "./LinkDialog.css";

export interface LinkDialogProps {
  getEditor: () => Editor | undefined;
  onClose: () => void;
}

export function LinkDialog({ getEditor, onClose }: LinkDialogProps) {
  const [url, setUrl] = useState("https://");
  const [text, setText] = useState("");
  const urlInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const editor = getEditor();
    if (editor) {
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { from, to } = view.state.selection;
        const selected = from !== to ? view.state.doc.textBetween(from, to, " ") : "";
        setText(selected);
      });
    }
    setTimeout(() => {
      urlInputRef.current?.focus();
      urlInputRef.current?.select();
    }, 50);
  }, [getEditor]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalUrl = url.trim();
    if (!finalUrl) {
      onClose();
      return;
    }
    const finalText = text.trim() || finalUrl;
    const editor = getEditor();
    if (editor) {
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { state } = view;
        const { from, to } = state.selection;
        const linkMark = state.schema.marks.link;
        if (!linkMark) return;

        if (from === to) {
          const mark = linkMark.create({ href: finalUrl });
          const textNode = state.schema.text(finalText, [mark]);
          view.dispatch(state.tr.replaceSelectionWith(textNode, false).scrollIntoView());
        } else {
          const mark = linkMark.create({ href: finalUrl });
          const tr = state.tr.addMark(from, to, mark);
          if (finalText && finalText !== state.doc.textBetween(from, to, " ")) {
            tr.insertText(finalText, from, to);
            tr.addMark(from, from + finalText.length, mark);
          }
          view.dispatch(tr.scrollIntoView());
        }
        view.focus();
      });
    }
    onClose();
  };

  return (
    <div className="link-dialog-backdrop" onClick={onClose}>
      <div
        className="link-dialog-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="link-dialog-header">
          <h3 id="link-dialog-title">插入链接</h3>
          <button
            type="button"
            className="link-dialog-close"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="link-dialog-form">
          <div className="link-dialog-field">
            <label htmlFor="link-url-input">链接地址 (URL)</label>
            <input
              id="link-url-input"
              ref={urlInputRef}
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="link-dialog-input"
              required
            />
          </div>

          <div className="link-dialog-field">
            <label htmlFor="link-text-input">链接文本（可留空，默认同 URL）</label>
            <input
              id="link-text-input"
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="链接显示文本"
              className="link-dialog-input"
            />
          </div>

          <div className="link-dialog-actions">
            <button
              type="button"
              className="link-dialog-btn link-dialog-btn-cancel"
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="submit"
              className="link-dialog-btn link-dialog-btn-confirm"
            >
              确认插入
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default LinkDialog;
