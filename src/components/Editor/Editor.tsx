import { useEffect, useRef } from "react";
import { Milkdown, MilkdownProvider, useEditor, useInstance } from "@milkdown/react";
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  parserCtx,
  rootCtx,
} from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { nord } from "@milkdown/theme-nord";
import "@milkdown/kit/prose/view/style/prosemirror.css";

interface EditorProps {
  /** 受控的 Markdown 文本。外部传入新值时会覆盖编辑器内容 */
  value: string;
  /** 内容变更回调，输出当前 Markdown 源码 */
  onChange?: (markdown: string) => void;
}

/**
 * 内部组件：在 MilkdownProvider 内部使用 useEditor / useInstance。
 * 负责创建编辑器实例、同步外部 value、对外抛出 markdown 变更。
 *
 * 注意：React 集成层会在 getEditor 返回后自行调用 editor.create()，
 * 所以这里不要调用 .create()，也不要调用 .container()（该方法不存在）。
 * 挂载点通过 config 里 ctx.set(rootCtx, container) 注入。
 */
function EditorInner({ value, onChange }: EditorProps) {
  // 记录最近一次同步进编辑器的 value，避免 onChange 回写的值又触发覆盖，造成循环
  const lastSyncedRef = useRef(value);
  // onChange 用 ref 持有，避免它变化导致编辑器重建
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEditor(
    (container) =>
      Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, container);
          ctx.set(defaultValueCtx, value);
          // 监听 markdown 变更，精准回调
          ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
            // 编辑器内部产生的变更才回调；外部 value 同步进来的不回调
            if (markdown !== lastSyncedRef.current) {
              lastSyncedRef.current = markdown;
              onChangeRef.current?.(markdown);
            }
          });
          // 注入主题
          nord(ctx);
        })
        .use(commonmark)
        .use(history)
        .use(listener),
    // 依赖数组为空，编辑器只在挂载时创建一次
    [],
  );

  const [loading, getEditor] = useInstance();

  // 外部 value 变化时，覆盖编辑器内容（仅当与上次同步值不同时）
  useEffect(() => {
    if (loading) return;
    if (value === lastSyncedRef.current) return;
    const editor = getEditor();
    if (!editor) return;
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const parser = ctx.get(parserCtx);
      const newDoc = parser(value);
      view.dispatch(
        view.state.tr.replaceWith(0, view.state.doc.content.size, newDoc.content),
      );
    });
    lastSyncedRef.current = value;
  }, [value, loading, getEditor]);

  return <Milkdown />;
}

/**
 * 编辑器对外组件。
 * 任务 2：占满窗口的编辑区，支持基础 Markdown 快捷语法
 * （标题/加粗/斜体/列表/引用/分割线由 commonmark preset 提供）。
 */
export function MarkdownEditor({ value, onChange }: EditorProps) {
  return (
    <MilkdownProvider>
      <EditorInner value={value} onChange={onChange} />
    </MilkdownProvider>
  );
}

export default MarkdownEditor;
