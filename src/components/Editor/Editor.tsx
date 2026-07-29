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
import { imageView } from "./image-node-view";
import { imageUploadPlugin } from "./image-upload";
import { linkClickPlugin } from "./link-click";
import { outlineTrackerPlugin } from "./outline-tracker";
import { formulaNumberingPlugin } from "./formula-numbering";
import { editorModesPlugin } from "./editor-modes";
import { searchPlugin } from "./search";
import { useSettings } from "../../store/settings";
import {
  remarkMathPlugin,
  mathInlineSchema,
  mathDisplaySchema,
  mathInlineView,
  mathDisplayView,
} from "./math";
import {
  remarkFrontmatterPlugin,
  frontmatterSchema,
  frontmatterView,
} from "./frontmatter";
import { footnoteRefView, footnoteDefinitionView } from "./footnotes";
import { tocPlugin, tocSchema, tocView, remarkTocPlugin } from "./toc";

interface EditorProps {
  /** 受控的 Markdown 文本。外部传入新值时会覆盖编辑器内容 */
  value: string;
  /** 内容变更回调，输出当前 Markdown 源码 */
  onChange?: (markdown: string) => void;
  /** 编辑器实例就绪回调，外部可持有 getEditor 用于跳转等操作 */
  onReady?: (getEditor: () => Editor | undefined) => void;
}

/**
 * 内部组件：在 MilkdownProvider 内部使用 useEditor / useInstance。
 * 负责创建编辑器实例、同步外部 value、对外抛出 markdown 变更。
 *
 * 注意：React 集成层会在 getEditor 返回后自行调用 editor.create()，
 * 所以这里不要调用 .create()，也不要调用 .container()（该方法不存在）。
 * 挂载点通过 config 里 ctx.set(rootCtx, container) 注入。
 */
function EditorInner({ value, onChange, onReady }: EditorProps) {
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
            // 图片拖拽/粘贴上传：复制到 assets/ 并插入相对路径
            imageUploadPlugin(),
            // 链接跟随：Ctrl/Cmd+点击打开外部链接或跳转内部锚点
            linkClickPlugin(),
            // 大纲当前标题跟踪：光标变化时更新 store 中的高亮标题
            outlineTrackerPlugin(),
            // 公式自动编号：给 math_display 节点按顺序设置 number attr
            formulaNumberingPlugin(),
            // 专注模式 + 打字机模式
            editorModesPlugin(),
            // 查找替换：高亮匹配、导航、替换
            searchPlugin(),
            // [TOC] 目录自动生成：根据文档标题实时生成目录
            tocPlugin(),
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
        // 图片：相对路径解析为可加载 URL（保持 markdown 源码为相对路径）
        .use(imageView)
        // 数学公式：remark-math 解析 + KaTeX 渲染（行内 $...$ 和块级 $$...$$）
        .use(remarkMathPlugin)
        .use(mathInlineSchema)
        .use(mathDisplaySchema)
        .use(mathInlineView)
        .use(mathDisplayView)
        // YAML Front Matter：remark-frontmatter 解析 + CodeMirror 编辑
        .use(remarkFrontmatterPlugin)
        .use(frontmatterSchema)
        .use(frontmatterView)
        // 脚注：GFM 预设已注册 schema，这里仅覆盖 NodeView 提供跳转交互
        .use(footnoteRefView)
        .use(footnoteDefinitionView)
        // [TOC] 目录块节点
        .use(remarkTocPlugin)
        .use(tocSchema)
        .use(tocView)
        .use(history)
        .use(listener),
    // 依赖数组为空，编辑器只在挂载时创建一次
    [],
  );

  const [loading, getEditor] = useInstance();

  // 编辑器就绪后通知外部，便于大纲面板等持有 getEditor
  useEffect(() => {
    if (!loading) onReady?.(getEditor);
  }, [loading, getEditor, onReady]);

  // 公式自动编号 / 专注模式开关切换时，dispatch 空 tr 触发重算（appendTransaction + decorations）
  const getEditorRef = useRef(getEditor);
  getEditorRef.current = getEditor;
  useEffect(() => {
    let lastFormula = useSettings.getState().formulaAutoNumber;
    let lastFocus = useSettings.getState().focusMode;
    const unsub = useSettings.subscribe((s) => {
      if (s.formulaAutoNumber === lastFormula && s.focusMode === lastFocus) return;
      lastFormula = s.formulaAutoNumber;
      lastFocus = s.focusMode;
      const editor = getEditorRef.current();
      if (!editor) return;
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        view.dispatch(view.state.tr);
      });
    });
    return unsub;
  }, []);

  // 专注模式：给 root 加 class，CSS 弱化非聚焦块
  const focusMode = useSettings((s) => s.focusMode);

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
    <div className={`md-editor-root${focusMode ? " focus-mode" : ""}`}>
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
export function MarkdownEditor({ value, onChange, onReady }: EditorProps) {
  return (
    <MilkdownProvider>
      <EditorInner value={value} onChange={onChange} onReady={onReady} />
    </MilkdownProvider>
  );
}

export default MarkdownEditor;
