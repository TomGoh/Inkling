import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { Plugin, PluginKey, TextSelection, AllSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { findParentNodeClosestToPos } from "@milkdown/kit/prose";
import { nord } from "@milkdown/theme-nord";
import "@milkdown/kit/prose/view/style/prosemirror.css";
import "@milkdown/kit/prose/tables/style/tables.css";
// TableToolbar 已提升到 App.tsx 的 topbar 下方作为固定非滚动行，
// 此处不再内部渲染；inTable 状态通过 onInTableChange 回调外露。
import { codeBlockView } from "./code-block-view";
import { imageView } from "./image-node-view";
import { imageUploadPlugin } from "./image-upload";
import { linkClickPlugin } from "./link-click";
import { outlineTrackerPlugin } from "./outline-tracker";
import { formulaNumberingPlugin, formulaNumberingKey } from "./formula-numbering";
import { editorModesPlugin } from "./editor-modes";
import { blockDragPlugin } from "./block-drag";
import { searchPlugin } from "./search";
import { useSettings } from "../../store/settings";
import { useWorkspace } from "../../store/workspace";
import type { EditorOutlineSnapshot } from "../../lib/outline";
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
import { htmlView } from "./html-view";
import { tocPlugin, tocSchema, tocView, remarkTocPlugin } from "./toc";
import {
  calloutSchema,
  calloutView,
  remarkCalloutPlugin,
} from "./callout";
import { slashMenuPlugin } from "./slash-menu";
import { autoPairPlugin } from "./auto-pair";
import { SourceModeEditor } from "./SourceModeEditor";
import {
  markdownOffsetToProsePos,
  prosePosToMarkdownOffset,
} from "../../lib/source-mode-cursor";

interface EditorProps {
  /** 当前 Markdown 文件完整路径，用于解析相对图片路径 */
  filePath: string;
  /** 受控的 Markdown 文本。外部传入新值时会覆盖编辑器内容 */
  value: string;
  /** 内容变更回调，输出当前 Markdown 源码 */
  onChange?: (markdown: string) => void;
  /** 编辑器实例就绪回调；卸载时传 null，避免外部继续使用旧实例 */
  onReady?: (getEditor: (() => Editor | undefined) | null) => void;
  /** 主编辑器渲染标题或当前标题变化时发布大纲快照 */
  onOutlineChange?: (snapshot: EditorOutlineSnapshot) => void;
  /** 光标进入/离开表格时回调，供外部工具栏切换上下文按钮组 */
  onInTableChange?: (inTable: boolean) => void;
  /** 是否处于源代码模式 */
  sourceMode?: boolean;
}

/**
 * 内部组件：在 MilkdownProvider 内部使用 useEditor / useInstance。
 * 负责创建编辑器实例、同步外部 value、对外抛出 markdown 变更。
 *
 * 注意：React 集成层会在 getEditor 返回后自行调用 editor.create()，
 * 所以这里不要调用 .create()，也不要调用 .container()（该方法不存在）。
 * 挂载点通过 config 里 ctx.set(rootCtx, container) 注入。
 */
function EditorInner({
  filePath,
  value,
  onChange,
  onReady,
  onOutlineChange,
  onInTableChange,
  sourceMode = false,
}: EditorProps) {
  const sourceModeRef = useRef(sourceMode);
  sourceModeRef.current = sourceMode;
  const prevSourceModeRef = useRef(sourceMode);
  const exitSnapshotRef = useRef<{ cursor: number; scrollTop: number } | null>(null);
  const [enterSnapshot, setEnterSnapshot] = useState<{
    cursor: number;
    scrollTop: number;
  } | null>(sourceMode ? { cursor: 0, scrollTop: 0 } : null);
  // 记录最近一次同步进编辑器的 value，避免 onChange 回写的值又触发覆盖，造成循环
  const lastSyncedRef = useRef(value);
  // onChange 用 ref 持有，避免它变化导致编辑器重建
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  // 大纲回调用 ref 持有，避免回调变化导致编辑器重建
  const onOutlineChangeRef = useRef(onOutlineChange);
  onOutlineChangeRef.current = onOutlineChange;

  // 光标是否位于表格内，用于控制表格工具栏的上下文按钮组
  const [inTable, setInTable] = useState(false);
  const inTableRef = useRef(false);
  // inTable 变化时通知外部（工具栏已提升到 App.tsx）
  const onInTableChangeRef = useRef(onInTableChange);
  onInTableChangeRef.current = onInTableChange;
  useEffect(() => {
    onInTableChangeRef.current?.(inTable);
  }, [inTable]);

  // 编辑位置记忆：持有 store 方法，插件内部通过 ref 调用避免重建
  const saveCursorState = useWorkspace((s) => s.saveCursorState);
  const saveCursorStateRef = useRef(saveCursorState);
  saveCursorStateRef.current = saveCursorState;

  useEditor(
    (container) => {
      // 整个工厂包 try/catch：任何插件初始化抛错时返回 undefined，
      // 避免异常冒泡导致 React 卸载整棵树白屏。
      // 返回 undefined 后 useInstance 的 loading 不会结束，
      // 下方的降级检测会在超时后切换到只读 textarea 显示原始内容。
      try {
        return Editor.make()
          .config((ctx) => {
            ctx.set(rootCtx, container);
            ctx.set(defaultValueCtx, value);
            // 监听 markdown 变更，精准回调
            ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
              if (sourceModeRef.current) return;
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
              // 图片拖拽/粘贴上传：复制到当前文档的 assets/ 并插入相对路径
              imageUploadPlugin(filePath),
              // 链接跟随：Ctrl/Cmd+点击打开外部链接或跳转内部锚点
              linkClickPlugin(),
              // 仅主编辑器发布大纲；分屏编辑器不传回调，避免覆盖主面板。
              ...(onOutlineChange
                ? [
                    outlineTrackerPlugin((snapshot) =>
                      onOutlineChangeRef.current?.(snapshot),
                    ),
                  ]
                : []),
              // 公式自动编号：给 math_display 节点按顺序设置 number attr
              formulaNumberingPlugin(),
              // 专注模式 + 打字机模式
              editorModesPlugin(),
              blockDragPlugin(),
              // 查找替换：高亮匹配、导航、替换
              searchPlugin(),
              // [TOC] 目录自动生成：根据文档标题实时生成目录
              tocPlugin(),
              // 编辑位置记忆：选区/滚动变化时缓存到本地，
              // 防抖 300ms、失焦或销毁时再落 store，避免每次光标移动都
              // 写 openTabs 触发 TabsBar 等订阅组件重渲染。
              new Plugin({
                key: new PluginKey("inkling-cursor-saver"),
                view: (view) => {
                  let lastPos = -1;
                  let lastScroll = -1;
                  let timer: ReturnType<typeof setTimeout> | null = null;
                  const flush = () => {
                    if (timer) {
                      clearTimeout(timer);
                      timer = null;
                    }
                    if (lastPos < 0) return;
                    saveCursorStateRef.current(lastPos, lastScroll);
                  };
                  const schedule = (pos: number, scrollTop: number) => {
                    lastPos = pos;
                    lastScroll = scrollTop;
                    if (timer) clearTimeout(timer);
                    timer = setTimeout(flush, 300);
                  };
                  // 失焦立即落盘
                  view.dom.addEventListener("blur", flush);
                  return {
                    update: (nextView) => {
                      const pos = nextView.state.selection.head;
                      const scrollEl = (nextView as EditorView & { scrollDOM?: HTMLElement }).scrollDOM;
                      const scrollTop = scrollEl ? scrollEl.scrollTop : 0;
                      schedule(pos, scrollTop);
                    },
                    destroy: () => {
                      flush();
                      view.dom.removeEventListener("blur", flush);
                    },
                  };
                },
              }),
              // 斜杠菜单：输入 `/` 弹出块类型选择菜单
              slashMenuPlugin(),
              // 自动配对补全：输入括号/引号自动配对
              autoPairPlugin(),
              // Ctrl/Cmd+A 全选整个文档（ProseMirror 默认 Mod-a 只选当前块文本）
              new Plugin({
                key: new PluginKey("inkling-select-all"),
                props: {
                  handleKeyDown: (_view, event) => {
                    const mod = event.ctrlKey || event.metaKey;
                    if (!mod || event.shiftKey || event.altKey) return false;
                    if (event.key.toLowerCase() !== "a") return false;
                    const view = _view;
                    const { state } = view;
                    const sel = new AllSelection(state.doc);
                    if (!state.selection.eq(sel)) {
                      view.dispatch(state.tr.setSelection(sel).scrollIntoView());
                    }
                    event.preventDefault();
                    return true;
                  },
                },
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
          // 图片：相对路径解析为可加载 URL（保持 markdown 源码为相对路径）
          .use(imageView(filePath))
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
          // HTML 嵌入：覆盖 commonmark htmlSchema 的 NodeView，白名单渲染真实 HTML 标签
          .use(htmlView)
          // [TOC] 目录块节点
          .use(remarkTocPlugin)
          .use(tocSchema)
          .use(tocView)
          // callout 提示框：> [!WARNING] 等 GFM 语法
          .use(remarkCalloutPlugin)
          .use(calloutSchema)
          .use(calloutView)
          .use(history)
          .use(listener);
      } catch (e) {
        console.error("Milkdown 编辑器初始化失败：", e);
        return undefined;
      }
    },
    // 依赖数组为空，编辑器只在挂载时创建一次；filePath 变化由外层 key 触发重建
    [],
  );

  const [loading, getEditor] = useInstance();

  // 降级检测：
  // 1) loading 持续超过 3 秒仍未就绪 → 工厂抛错返回 undefined
  // 2) loading 切到 false 后 getEditor() 仍为空 → editor.create() 异步阶段抛错
  //    （Milkdown React 集成层会 .catch(console.error) 吞掉错误，editorRef 不会赋值）
  // 两种情况都切换到只读 textarea 模式显示原始 markdown，避免白屏。
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    if (loading) {
      const timer = setTimeout(() => setFallback(true), 3000);
      return () => clearTimeout(timer);
    }
    // loading=false 后必须验证 editor 实例真的存在
    const editor = getEditor();
    setFallback(!editor);
  }, [loading, getEditor]);

  // 在浏览器绘制可点击的大纲前发布实例；卸载时同步清除旧 getter。
  useLayoutEffect(() => {
    if (loading || !getEditor()) return;
    onReady?.(getEditor);
    return () => onReady?.(null);
  }, [loading, getEditor, onReady]);

  // 公式自动编号 / 专注模式开关切换时，dispatch 空 tr 触发重算（appendTransaction + decorations）
  const getEditorRef = useRef(getEditor);
  getEditorRef.current = getEditor;

  useEffect(() => {
    if (sourceMode) {
      inTableRef.current = false;
      setInTable(false);
      onInTableChangeRef.current?.(false);
    }
  }, [sourceMode]);

  // 进入/退出源码模式：采集光标、互斥专注/打字机、退出时灌回 PM
  useLayoutEffect(() => {
    const prev = prevSourceModeRef.current;
    if (sourceMode && !prev) {
      const settings = useSettings.getState();
      if (settings.focusMode) settings.setFocusMode(false);
      if (settings.typewriterMode) settings.setTypewriterMode(false);

      let cursor = 0;
      let scrollTop = 0;
      const editor = getEditor();
      if (editor) {
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const head = view.state.selection.head;
          const textBefore = view.state.doc.textBetween(0, head, "\n", "\n");
          cursor = prosePosToMarkdownOffset(value, textBefore);
          const scrollEl =
            (view as EditorView & { scrollDOM?: HTMLElement }).scrollDOM ??
            view.dom.closest(".editor-scroll");
          scrollTop = scrollEl instanceof HTMLElement ? scrollEl.scrollTop : 0;
        });
      }
      setEnterSnapshot({ cursor, scrollTop });
      lastSyncedRef.current = value;
    }

    if (!sourceMode && prev) {
      const snap = exitSnapshotRef.current;
      exitSnapshotRef.current = null;
      const editor = getEditor();
      if (editor) {
        let parseOk = false;
        try {
          editor.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            const parser = ctx.get(parserCtx);
            const newDoc = parser(value);
            view.dispatch(
              view.state.tr.replaceWith(0, view.state.doc.content.size, newDoc.content),
            );
          });
          lastSyncedRef.current = value;
          parseOk = true;
        } catch (e) {
          console.error("退出源码模式时解析失败：", e);
          void navigator.clipboard.writeText(value).catch(() => {});
          alert(
            "解析失败：无法切换回渲染视图。当前 Markdown 仍保留在编辑器中，并已尝试复制到剪贴板。请检查源码语法后重试。",
          );
          // 保留快照以便 SourceModeEditor 重新挂载（enterSnapshot 为 null 会空白）
          setEnterSnapshot({
            cursor: snap?.cursor ?? 0,
            scrollTop: snap?.scrollTop ?? 0,
          });
          useWorkspace.getState().setTabSourceMode(true, filePath);
          prevSourceModeRef.current = true;
          return;
        }
        setEnterSnapshot(null);
        if (parseOk && snap) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const ed = getEditorRef.current();
              if (!ed) return;
              ed.action((ctx) => {
                const view = ctx.get(editorViewCtx);
                const docSize = view.state.doc.content.size;
                const pos = markdownOffsetToProsePos(docSize, value, snap.cursor);
                try {
                  const sel = TextSelection.near(
                    view.state.doc.resolve(Math.max(1, Math.min(pos, docSize - 1))),
                    -1,
                  );
                  view.dispatch(view.state.tr.setSelection(sel));
                } catch {
                  try {
                    view.dispatch(
                      view.state.tr.setSelection(
                        TextSelection.near(view.state.doc.resolve(1), 1),
                      ),
                    );
                  } catch {
                    // pos 无效时忽略
                  }
                }
                const scrollEl =
                  (view as EditorView & { scrollDOM?: HTMLElement }).scrollDOM ??
                  view.dom.closest(".editor-scroll");
                if (scrollEl instanceof HTMLElement) {
                  scrollEl.scrollTop = snap.scrollTop;
                }
              });
            });
          });
        }
      }
    }

    prevSourceModeRef.current = sourceMode;
  }, [sourceMode, getEditor, value]);

  /**
   * 点击编辑器空白区域（右侧 padding / 文档下方空白）时的光标定位：
   * - 点击落在有效内容节点上：交给 ProseMirror 自行处理
   * - 点击落在内容区之外（右侧 padding 等）：把 x 夹到编辑器内容区内再查一次
   *   posAtCoords，让光标落在点击 y 对应的行附近，而不是直接跳到文档最底部
   * - 点击 y 超出所有内容（真正的文档下方空白）：在末尾追加空段落并聚焦
   */
  const handleRootMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const editor = getEditorRef.current();
    if (!editor) return;
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      // 原始坐标落在可编辑内容上：交给 ProseMirror 自行处理光标定位
      const direct = view.posAtCoords({ left: e.clientX, top: e.clientY });
      if (direct != null) return;

      // 原始坐标落在内容区之外：把 x 夹到 view.dom 内再查一次
      let fallbackPos: number | null = null;
      const domRect = view.dom.getBoundingClientRect();
      if (domRect.width > 0) {
        const clampedX = Math.max(
          domRect.left + 1,
          Math.min(e.clientX, domRect.right - 1),
        );
        const hit = view.posAtCoords({ left: clampedX, top: e.clientY });
        if (hit != null) fallbackPos = hit.pos;
      }

      e.preventDefault();

      if (fallbackPos != null) {
        // 点击 y 对应到某一行：把光标放到该位置附近
        try {
          const $pos = view.state.doc.resolve(fallbackPos);
          const sel = TextSelection.near($pos);
          view.dispatch(view.state.tr.setSelection(sel).scrollIntoView());
          view.focus();
        } catch {
          // 忽略无效位置
        }
        return;
      }

      // 点击 y 超出所有内容（真正的文档下方空白）：在末尾追加空段落
      const { state } = view;
      const doc = state.doc;
      const lastChild = doc.lastChild;
      let tr = state.tr;
      let focusPos: number;
      if (!lastChild || lastChild.type.name !== "paragraph") {
        const para = state.schema.nodes.paragraph.create();
        const end = doc.content.size;
        tr = tr.insert(end, para);
        focusPos = end + 1; // 段落内容起始
      } else {
        focusPos = doc.content.size - 1; // 末尾段落内末尾
      }
      const sel = TextSelection.near(tr.doc.resolve(focusPos), -1);
      tr = tr.setSelection(sel).scrollIntoView();
      view.dispatch(tr);
      view.focus();
    });
  };
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
        // 发送 recalc meta 触发公式编号重算（空 tr 本身不 docChanged，需 meta 显式触发）
        view.dispatch(view.state.tr.setMeta(formulaNumberingKey, { recalc: true }));
      });
    });
    return unsub;
  }, []);

  // 专注模式：给 root 加 class，CSS 弱化非聚焦块
  const focusMode = useSettings((s) => s.focusMode);
  // 拼写检查：通过 root div 的 spellCheck 属性，contentEditable 子节点（ProseMirror）继承此值
  const spellcheck = useSettings((s) => s.spellcheck);

  // 外部 value 变化时，覆盖编辑器内容（仅当与上次同步值不同时）
  useEffect(() => {
    if (loading || sourceMode) return;
    if (value === lastSyncedRef.current) return;
    const editor = getEditor();
    if (!editor) return;
    try {
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const parser = ctx.get(parserCtx);
        const newDoc = parser(value);
        view.dispatch(
          view.state.tr.replaceWith(0, view.state.doc.content.size, newDoc.content),
        );
      });
      lastSyncedRef.current = value;
    } catch (e) {
      // 解析失败时降级：清空编辑器并写入纯文本段落，避免异常冒泡导致白屏
      console.error("编辑器内容解析失败：", e);
      try {
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const schema = view.state.schema;
          const textNode = schema.text(value);
          const para = schema.nodes.paragraph.create(null, textNode);
          view.dispatch(
            view.state.tr.replaceWith(0, view.state.doc.content.size, para),
          );
        });
        lastSyncedRef.current = value;
      } catch {
        // 连降级都失败，放弃同步，交由 ErrorBoundary 兜底
      }
    }
  }, [value, loading, getEditor, sourceMode]);

  // 编辑位置记忆：value 变化（切 tab）后恢复光标和滚动位置
  // 用 currentFile 作为依赖，而非 value，避免内容编辑时也触发恢复
  const currentFile = useWorkspace((s) => s.currentFile);
  const getActiveCursorState = useWorkspace((s) => s.getActiveCursorState);
  useEffect(() => {
    if (loading || sourceMode) return;
    const editor = getEditor();
    if (!editor) return;
    const { pos, scrollTop } = getActiveCursorState();
    if (pos == null && scrollTop == null) return;
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      // 恢复光标位置，夹紧到文档有效范围
      if (pos != null) {
        const docSize = view.state.doc.content.size;
        const safePos = Math.max(0, Math.min(pos, docSize));
        try {
          const sel = TextSelection.near(view.state.doc.resolve(safePos));
          view.dispatch(view.state.tr.setSelection(sel));
        } catch {
          // pos 无效时忽略
        }
      }
      // 恢复滚动位置（下一帧执行，等文档渲染完）
      const scrollEl = (view as EditorView & { scrollDOM?: HTMLElement }).scrollDOM;
      if (scrollTop != null && scrollEl) {
        requestAnimationFrame(() => {
          const el = (view as EditorView & { scrollDOM?: HTMLElement }).scrollDOM;
          if (el) el.scrollTop = scrollTop;
        });
      }
    });
  }, [currentFile, loading, getEditor, getActiveCursorState, sourceMode]);

  // 降级模式：Milkdown 初始化失败，显示只读 textarea 展示原始 markdown
  if (fallback) {
    return (
      <div className="md-editor-root md-editor-fallback">
        <div className="md-editor-fallback-banner">
          ⚠️ 富文本编辑器加载失败，已切换到只读源码模式。内容未丢失，可正常保存。
        </div>
        <textarea
          className="md-editor-fallback-textarea"
          value={value}
          readOnly
          spellCheck={false}
        />
      </div>
    );
  }

  return (
    <div
      className={`md-editor-root${focusMode && !sourceMode ? " focus-mode" : ""}${sourceMode ? " source-mode-active" : ""}`}
      spellCheck={spellcheck && !sourceMode}
      onMouseDown={sourceMode ? undefined : handleRootMouseDown}
    >
      <div
        className="md-editor-wysiwyg"
        style={{ display: sourceMode ? "none" : undefined }}
      >
        <Milkdown />
      </div>
      {sourceMode && enterSnapshot && (
        <SourceModeEditor
          value={value}
          onChange={(md) => {
            lastSyncedRef.current = md;
            onChangeRef.current?.(md);
          }}
          initialCursor={enterSnapshot.cursor}
          initialScrollTop={enterSnapshot.scrollTop}
          spellcheck={spellcheck}
          onUnmountSnapshot={(snap) => {
            exitSnapshotRef.current = snap;
          }}
        />
      )}
    </div>
  );
}

/**
 * 编辑器对外组件。
 * 阶段二任务6：在 commonmark 基础上集成 GFM（表格 + 任务列表 + 删除线），
 * 启用列宽拖拽，并提供插入表格、行列增删、对齐、删除表格的工具栏。
 */
export function MarkdownEditor({
  filePath,
  value,
  onChange,
  onReady,
  onOutlineChange,
  onInTableChange,
  sourceMode,
}: EditorProps) {
  return (
    <MilkdownProvider>
      <EditorInner
        filePath={filePath}
        value={value}
        onChange={onChange}
        onReady={onReady}
        onOutlineChange={onOutlineChange}
        onInTableChange={onInTableChange}
        sourceMode={sourceMode}
      />
    </MilkdownProvider>
  );
}

export default MarkdownEditor;
