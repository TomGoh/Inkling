// 源代码模式编辑器：整页 CodeMirror 6 编辑原始 Markdown

import { useEffect, useLayoutEffect, useRef } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { openSearchPanel, replaceNext } from "@codemirror/search";
import { createSourceModeExtensions } from "../../lib/codemirror-shared";
import {
  extractMarkdownOutline,
  type EditorOutlineSnapshot,
} from "../../lib/outline";
import {
  registerSourceModeScroll,
  unregisterSourceModeScroll,
} from "../../lib/source-mode-scroll";
import {
  registerSourceModeSearch,
  unregisterSourceModeSearch,
} from "../../lib/source-mode-search";
import { useSettings } from "../../store/settings";

export interface SourceModeSnapshot {
  cursor: number;
  scrollTop: number;
}

export interface SourceModeEditorProps {
  /** 当前文件完整路径，用于查找命令路由（issue #29） */
  filePath: string;
  value: string;
  onChange: (markdown: string) => void;
  /** 进入源码模式时的初始光标（markdown 字符串 offset） */
  initialCursor?: number;
  /** 进入时的初始 scrollTop */
  initialScrollTop?: number;
  spellcheck: boolean;
  /** 卸载前回传 CM 光标与滚动位置 */
  onUnmountSnapshot?: (snapshot: SourceModeSnapshot) => void;
  /** 大纲变更通知（Issue #118） */
  onOutlineChange?: (snapshot: EditorOutlineSnapshot) => void;
}

export function SourceModeEditor({
  filePath,
  value,
  onChange,
  initialCursor = 0,
  initialScrollTop = 0,
  spellcheck,
  onUnmountSnapshot,
  onOutlineChange,
}: SourceModeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onUnmountRef = useRef(onUnmountSnapshot);
  onUnmountRef.current = onUnmountSnapshot;
  const onOutlineChangeRef = useRef(onOutlineChange);
  onOutlineChangeRef.current = onOutlineChange;
  const lastEmittedRef = useRef(value);
  const themeCompRef = useRef(new Compartment());

  const codeBlockTheme = useSettings((s) => s.codeBlockTheme);

  // 用 useLayoutEffect 确保卸载 cleanup 在父组件 layout effect 读取快照之前执行
  useLayoutEffect(() => {
    if (!hostRef.current) return;
    const safeCursor = Math.max(0, Math.min(initialCursor, value.length));
    const themeComp = themeCompRef.current;

    // 辅助函数：根据当前滚动条位置估算当前活动标题
    const computeActiveHeadingIndex = (
      view: EditorView,
      headings: ReturnType<typeof extractMarkdownOutline>,
    ): number => {
      if (headings.length === 0) return -1;
      const scroller = view.scrollDOM;
      const targetTop = scroller.scrollTop + 12;

      let bestIndex = 0;
      for (let i = 0; i < headings.length; i++) {
        const lineInfo = view.lineBlockAt(
          Math.min(headings[i].pos, view.state.doc.length),
        );
        if (lineInfo.top <= targetTop) {
          bestIndex = i;
        } else {
          break;
        }
      }
      return bestIndex;
    };

    let scrollRaf: number | null = null;
    let activeHeadings = extractMarkdownOutline(value);
    let currentActiveIndex = -1;

    const notifyOutline = (view: EditorView) => {
      const activeIdx = computeActiveHeadingIndex(view, activeHeadings);
      currentActiveIndex = activeIdx;
      onOutlineChangeRef.current?.({
        headings: activeHeadings,
        activeIndex: activeIdx,
      });
    };

    const state = EditorState.create({
      doc: value,
      selection: { anchor: safeCursor, head: safeCursor },
      extensions: [
        themeComp.of(createSourceModeExtensions({ codeBlockTheme, spellcheck })),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const md = update.state.doc.toString();
            if (md !== lastEmittedRef.current) {
              lastEmittedRef.current = md;
              onChangeRef.current(md);
            }
            activeHeadings = extractMarkdownOutline(md);
            notifyOutline(update.view);
          }
        }),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;

    // 注册大纲点击滚动与跳转（Issue #118）
    registerSourceModeScroll(filePath, {
      scrollToHeading: (heading) => {
        const v = viewRef.current;
        if (!v) return;
        let targetPos = -1;
        const currentDoc = v.state.doc.toString();
        // 如果当前 heading.pos 处的文本刚好匹配
        if (
          heading.pos >= 0 &&
          heading.pos < currentDoc.length
        ) {
          targetPos = heading.pos;
        }
        // 如果位置偏移，从当前文档重新提取大纲进行匹配
        if (targetPos === -1 || targetPos > currentDoc.length) {
          const freshHeadings = extractMarkdownOutline(currentDoc);
          const matched =
            freshHeadings.find((h) => h.id === heading.id) ||
            freshHeadings.find(
              (h) => h.text === heading.text && h.level === heading.level,
            ) ||
            freshHeadings[heading.index];
          if (matched) {
            targetPos = matched.pos;
          }
        }
        if (targetPos < 0) return;

        // 移动光标并平滑滚动到该行
        v.dispatch({
          selection: { anchor: targetPos, head: targetPos },
          effects: EditorView.scrollIntoView(targetPos, { y: "start", yMargin: 20 }),
        });
        v.focus();
      },
      getScrollAndCursor: () => ({
        scrollTop: view.scrollDOM.scrollTop,
        cursor: view.state.selection.main.head,
      }),
    });

    // 监听滚动更新大纲高亮（Issue #118）
    const handleScroll = () => {
      if (scrollRaf !== null) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = null;
        const v = viewRef.current;
        if (!v) return;
        const nextActive = computeActiveHeadingIndex(v, activeHeadings);
        if (nextActive !== currentActiveIndex) {
          currentActiveIndex = nextActive;
          onOutlineChangeRef.current?.({
            headings: activeHeadings,
            activeIndex: nextActive,
          });
        }
      });
    };
    view.scrollDOM.addEventListener("scroll", handleScroll, { passive: true });

    // 初始通知大纲
    notifyOutline(view);

    // 注册查找命令路由：全局 Ctrl+F/Ctrl+R 在源码模式打开 CM 内置面板（issue #29）
    registerSourceModeSearch(filePath, (opts) => {
      const v = viewRef.current;
      if (!v) return;
      // 新版 @codemirror/search 无独立 replace 命令：替换框内建在搜索面板里。
      // replace 模式用 replaceNext（未选中匹配时打开面板，否则逐个替换）。
      const cmd = opts.replace ? replaceNext : openSearchPanel;
      cmd(v);
      v.focus();
    });
    if (initialScrollTop > 0) {
      view.scrollDOM.scrollTop = initialScrollTop;
    }
    requestAnimationFrame(() => view.focus());

    return () => {
      unregisterSourceModeScroll(filePath);
      unregisterSourceModeSearch(filePath);
      view.scrollDOM.removeEventListener("scroll", handleScroll);
      if (scrollRaf !== null) cancelAnimationFrame(scrollRaf);
      onUnmountRef.current?.({
        cursor: view.state.selection.main.head,
        scrollTop: view.scrollDOM.scrollTop,
      });
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- CM 实例只在挂载时创建一次
  }, [filePath]);

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
      // a11y（issue #28）：声明文本编辑语义与模式上下文，屏幕阅读器可感知
      role="textbox"
      aria-multiline="true"
      aria-label="Markdown 源代码编辑器"
    >
      <div ref={hostRef} className="source-mode-cm-host" />
    </div>
  );
}
