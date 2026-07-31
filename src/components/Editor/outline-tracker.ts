// 大纲当前标题跟踪插件
// 从 ProseMirror 视图发布渲染标题及当前标题，供主编辑器大纲面板使用。

import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import {
  extractEditorOutline,
  findActiveHeadingIndex,
  type EditorOutlineSnapshot,
} from "../../lib/outline";

const key = new PluginKey("inkling-outline-tracker");

export const outlineTrackerPlugin = (
  onChange: (snapshot: EditorOutlineSnapshot) => void,
) =>
  new Plugin({
    key,
    view: (view) => {
      let headings = extractEditorOutline(view.state.doc);
      let activeIndex = findActiveHeadingIndex(
        headings,
        view.state.selection.head,
      );
      onChange({ headings, activeIndex });

      return {
        update: (nextView, previousState) => {
          const docChanged = nextView.state.doc !== previousState.doc;
          const nextHeadings = docChanged
            ? extractEditorOutline(nextView.state.doc)
            : headings;
          const nextActiveIndex = findActiveHeadingIndex(
            nextHeadings,
            nextView.state.selection.head,
          );

          if (docChanged || nextActiveIndex !== activeIndex) {
            headings = nextHeadings;
            activeIndex = nextActiveIndex;
            onChange({ headings, activeIndex });
          }
        },
      };
    },
  });
