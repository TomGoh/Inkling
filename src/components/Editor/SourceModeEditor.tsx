// 源代码模式编辑器：整页 CodeMirror 6 编辑原始 Markdown

import { useEffect, useLayoutEffect, useRef } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createSourceModeExtensions } from "../../lib/codemirror-shared";
import { useSettings } from "../../store/settings";

export interface SourceModeSnapshot {
  cursor: number;
  scrollTop: number;
}

export interface SourceModeEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  /** 进入源码模式时的初始光标（markdown 字符串 offset） */
  initialCursor?: number;
  /** 进入时的初始 scrollTop */
  initialScrollTop?: number;
  spellcheck: boolean;
  /** 卸载前回传 CM 光标与滚动位置 */
  onUnmountSnapshot?: (snapshot: SourceModeSnapshot) => void;
}

export function SourceModeEditor({
  value,
  onChange,
  initialCursor = 0,
  initialScrollTop = 0,
  spellcheck,
  onUnmountSnapshot,
}: SourceModeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onUnmountRef = useRef(onUnmountSnapshot);
  onUnmountRef.current = onUnmountSnapshot;
  const lastEmittedRef = useRef(value);
  const themeCompRef = useRef(new Compartment());

  const codeBlockTheme = useSettings((s) => s.codeBlockTheme);

  // 用 useLayoutEffect 确保卸载 cleanup 在父组件 layout effect 读取快照之前执行
  useLayoutEffect(() => {
    if (!hostRef.current) return;
    const safeCursor = Math.max(0, Math.min(initialCursor, value.length));
    const themeComp = themeCompRef.current;
    const state = EditorState.create({
      doc: value,
      selection: { anchor: safeCursor, head: safeCursor },
      extensions: [
        themeComp.of(createSourceModeExtensions({ codeBlockTheme, spellcheck })),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          const md = update.state.doc.toString();
          if (md === lastEmittedRef.current) return;
          lastEmittedRef.current = md;
          onChangeRef.current(md);
        }),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    if (initialScrollTop > 0) {
      view.scrollDOM.scrollTop = initialScrollTop;
    }
    requestAnimationFrame(() => view.focus());

    return () => {
      onUnmountRef.current?.({
        cursor: view.state.selection.main.head,
        scrollTop: view.scrollDOM.scrollTop,
      });
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- CM 实例只在挂载时创建一次
  }, []);

  // 外部 value 变化（切 tab、file watcher）同步到 CM
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const cur = view.state.doc.toString();
    if (value === cur) return;
    lastEmittedRef.current = value;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
  }, [value]);

  // 代码块主题变化时重配
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompRef.current.reconfigure(
        createSourceModeExtensions({ codeBlockTheme, spellcheck }),
      ),
    });
  }, [codeBlockTheme, spellcheck]);

  return (
    <div
      className="source-mode-editor"
      spellCheck={spellcheck}
      data-testid="source-mode-editor"
    >
      <div ref={hostRef} className="source-mode-cm-host" />
    </div>
  );
}
