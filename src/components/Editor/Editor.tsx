import { useEffect, useRef, useState } from "react";
import { Milkdown, MilkdownProvider, useEditor, useInstance } from "@milkdown/react";
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  parserCtx,
  prosePluginsCtx,
  rootCtx,
} from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import {
  gfm,
  columnResizingPlugin,
} from "@milkdown/kit/preset/gfm";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { findParentNodeClosestToPos } from "@milkdown/kit/prose";
import { nord } from "@milkdown/theme-nord";
import "@milkdown/kit/prose/view/style/prosemirror.css";
import "@milkdown/kit/prose/tables/style/tables.css";
import { TableToolbar } from "./TableToolbar";
import { codeBlockView } from "./code-block-view";

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

  // 光标是否位于表格内，用于控制表格工具栏的上下文按钮组
  const [inTable, setInTable] = useState(false);
  const inTableRef = useRef(false);

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
          // 注入选区跟踪插件：光标进入/离开表格时更新 inTable 状态
          ctx.update(prosePluginsCtx, (ps) => [
            ...ps,
            new Plugin({
              key: new PluginKey("inkling-table-tracker"),
              view: () => ({
                update: (view) => {
                  const found = findParentNodeClosestToPos(
                    (n) => n.type.name === "table",
                  )(view.state.selection.$head);
                  const next = !!found;
                  if (next !== inTableRef.current) {
                    inTableRef.current = next;
                    setInTable(next);
                  }
                },
              }),
            }),
          ]);
          // 注入主题
          nord(ctx);
        })
        .use(commonmark)
        .use(gfm)
        // 列宽拖拽调整（gfm 默认未启用，需单独引入）
        .use(columnResizingPlugin)
        // 代码块：CodeMirror 高亮 + 行号 + 语言切换
        .use(codeBlockView)
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

  return (
    <div className="md-editor-root">
      <TableToolbar getEditor={getEditor} inTable={inTable} />
      <Milkdown />
    </div>
  );
}

/**
 * 编辑器对外组件。
 * 阶段二任务6：在 commonmark 基础上集成 GFM（表格 + 任务列表 + 删除线），
 * 启用列宽拖拽，并提供插入表格、行列增删、对齐、删除表格的工具栏。
 */
export function MarkdownEditor({ value, onChange }: EditorProps) {
  return (
    <MilkdownProvider>
      <EditorInner value={value} onChange={onChange} />
    </MilkdownProvider>
  );
}

export default MarkdownEditor;
