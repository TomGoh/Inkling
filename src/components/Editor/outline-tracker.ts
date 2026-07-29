// 大纲当前标题跟踪插件
// 监听编辑器选区变化，找到光标上方最近的标题节点，
// 将其 slug 写入 workspace store，供大纲面板高亮。

import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { slugify } from "./link-click";
import { useWorkspace } from "../../store/workspace";

const key = new PluginKey("inkling-outline-tracker");

export const outlineTrackerPlugin = () =>
  new Plugin({
    key,
    view: () => ({
      update: (view) => {
        const { doc, selection } = view.state;
        const $head = selection.$head;

        // 从当前光标向前找最近的标题节点
        let slug: string | null = null;
        for (let depth = $head.depth; depth > 0; depth--) {
          const node = $head.node(depth);
          if (node.type.name === "heading") {
            slug = slugify(node.textContent);
            break;
          }
        }

        // 深度未命中时，向前扫描兄弟节点
        if (slug === null) {
          // 找到当前块级节点的起始位置，向前遍历查找标题
          const blockStart = $head.before($head.depth);
          if (blockStart > 0) {
            doc.nodesBetween(0, blockStart, (node, _pos, parent) => {
              if (slug) return false;
              if (parent && node.type.name === "heading") {
                slug = slugify(node.textContent);
              }
              return true;
            });
          }
        }

        const store = useWorkspace.getState();
        if (slug !== store.currentHeadingSlug) {
          store.setCurrentHeadingSlug(slug);
        }
      },
    }),
  });
