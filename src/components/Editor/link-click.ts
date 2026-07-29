// 链接点击跟随插件
// Ctrl/Cmd + 点击链接时：
//   - 外部链接（http/https/mailto）→ 系统默认浏览器打开
//   - 内部锚点（#标题）→ 滚动到文档中对应的标题
// 普通点击不触发，避免干扰编辑。

import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { Node } from "@milkdown/kit/prose/model";
import { isTauri } from "@tauri-apps/api/core";

const key = new PluginKey("inkling-link-click");

/**
 * GitHub 风格 slug：转小写、去标点、空格/下划线转连字符。
 * Unicode 感知（\p{L}\p{N}），中文等非 ASCII 字母保留。
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** 在文档中查找 slug 匹配的标题节点位置 */
function findHeadingPos(doc: Node, anchor: string): number | null {
  let result: number | null = null;
  doc.descendants((node, pos) => {
    if (node.type.name === "heading") {
      if (slugify(node.textContent) === anchor) {
        result = pos;
        return false; // 找到即停止遍历
      }
    }
    return true;
  });
  return result;
}

/** 外部链接：桌面端用 opener 打开系统默认浏览器，浏览器端用 window.open */
async function openExternal(href: string): Promise<void> {
  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(href);
  } else {
    window.open(href, "_blank", "noopener");
  }
}

/** 滚动编辑器视图到指定节点位置 */
function scrollToNode(view: EditorView, pos: number): void {
  const dom = view.nodeDOM(pos);
  if (dom instanceof HTMLElement) {
    dom.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

/**
 * 链接点击跟随插件。
 * 仅在 Ctrl/Cmd + 点击时触发，不影响普通编辑操作。
 */
export const linkClickPlugin = () =>
  new Plugin({
    key,
    props: {
      handleClick: (view, pos, event) => {
        if (!(event.ctrlKey || event.metaKey)) return false;

        const $pos = view.state.doc.resolve(pos);
        const linkMark = $pos.marks().find((m) => m.type.name === "link");
        if (!linkMark) return false;

        const href = (linkMark.attrs.href as string) ?? "";
        if (!href) return false;

        if (href.startsWith("#")) {
          // 内部锚点跳转
          const anchor = slugify(href.slice(1));
          if (!anchor) return false;
          const headingPos = findHeadingPos(view.state.doc, anchor);
          if (headingPos != null) {
            scrollToNode(view, headingPos);
          }
        } else if (/^(https?:|mailto:|tel:)/i.test(href)) {
          // 外部链接：系统默认浏览器打开
          void openExternal(href);
        }

        return true;
      },
    },
  });
