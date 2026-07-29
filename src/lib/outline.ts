// 大纲标题解析
// 从 markdown 文本中解析标题，生成带层级的树结构。
// 用于大纲面板展示，点击跳转。

import { slugify } from "../components/Editor/link-click";

export { slugify };

export interface OutlineHeading {
  /** 标题层级 1-6 */
  level: number;
  /** 标题文本（去除 # 前缀和尾部标记） */
  text: string;
  /** 在原文中的字符偏移（用于定位） */
  offset: number;
  /** 唯一 id（用于跳转匹配） */
  id: string;
}

/**
 * 解析 markdown 文本中的标题。
 * - 支持 ATX 风格 # ~ ######
 * - 跳过代码块内的 # 行（用 ``` 和 ~~~ 围栏判断）
 * - 跳过空标题（# 后无内容）
 * - setext 风格（下划 === / ---）暂不支持，保持简单
 */
export function parseOutline(markdown: string): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  const lines = markdown.split("\n");
  let offset = 0;
  let inFence: string | null = null; // 当前围栏标记（``` 或 ~~~）

  for (const line of lines) {
    const trimmed = line.trim();

    // 围栏代码块开闭检测
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      if (inFence === null) {
        inFence = fence[0].repeat(fence.length);
      } else if (fence[0] === inFence[0] && fence.length >= inFence.length) {
        inFence = null;
      }
      offset += line.length + 1;
      continue;
    }

    if (inFence === null) {
      const m = trimmed.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (m) {
        const level = m[1].length;
        const text = m[2].trim();
        if (text) {
          headings.push({
            level,
            text,
            offset,
            id: `h-${headings.length}-${slugify(text)}`,
          });
        }
      }
    }

    offset += line.length + 1; // +1 for \n
  }

  return headings;
}
