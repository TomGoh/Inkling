// 大纲标题解析
// 从 markdown 文本中解析标题，生成带层级的树结构。
// Markdown 源文本解析用于导出；编辑器面板使用 ProseMirror 渲染节点。

import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { slugify } from "../components/Editor/link-click";

export { slugify };

export interface EditorOutlineHeading {
  /** 标题在渲染文档中的顺序 */
  index: number;
  /** 标题层级 1-6 */
  level: number;
  /** ProseMirror 渲染后的可见文本 */
  text: string;
  /** 标题节点在 ProseMirror 文档中的位置 */
  pos: number;
  /** Milkdown 为标题生成的节点 id */
  nodeId: string | null;
  /** React 列表使用的唯一标识 */
  id: string;
}

export interface EditorOutlineSnapshot {
  headings: EditorOutlineHeading[];
  activeIndex: number | null;
}

export const EMPTY_EDITOR_OUTLINE: EditorOutlineSnapshot = {
  headings: [],
  activeIndex: null,
};

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

/** 提取标题在编辑器中呈现的文字；图片节点使用 alt 作为大纲文本。 */
function getEditorHeadingText(node: ProseMirrorNode): string {
  let text = "";
  node.descendants((child) => {
    if (child.isText) {
      text += child.text ?? "";
      return false;
    }
    if (child.type.name === "image") {
      if (typeof child.attrs.alt === "string") text += child.attrs.alt;
      return false;
    }
    if (child.type.name === "hardbreak") {
      text += " ";
      return false;
    }
    return true;
  });
  return text.trim();
}

/**
 * 从 ProseMirror 文档提取渲染后的标题。
 *
 * 面板、跳转和高亮必须共用该数据源，避免 `[Foo](bar)` 等 Markdown
 * 原文与渲染文本不同，导致 slug 与重复次数错位。
 */
export function extractEditorOutline(
  doc: ProseMirrorNode,
): EditorOutlineHeading[] {
  const headings: EditorOutlineHeading[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return true;

    const text = getEditorHeadingText(node);
    if (!text) return false;

    const rawLevel = Number(node.attrs.level);
    const level =
      Number.isInteger(rawLevel) && rawLevel >= 1 && rawLevel <= 6
        ? rawLevel
        : 1;
    const nodeId =
      typeof node.attrs.id === "string" && node.attrs.id
        ? node.attrs.id
        : null;
    const index = headings.length;
    headings.push({
      index,
      level,
      text,
      pos,
      nodeId,
      id: `h-${index}-${nodeId ?? slugify(text)}`,
    });

    return false;
  });

  return headings;
}

/** 根据标题节点 id 定位；文档刚更新、id 变化时回退到渲染顺序。 */
export function findEditorHeadingPos(
  doc: ProseMirrorNode,
  target: EditorOutlineHeading,
): number | null {
  const currentNode = doc.nodeAt(target.pos);
  if (currentNode?.type.name === "heading") {
    const currentId =
      typeof currentNode.attrs.id === "string" && currentNode.attrs.id
        ? currentNode.attrs.id
        : null;
    if (
      (target.nodeId && currentId === target.nodeId) ||
      (!target.nodeId &&
        getEditorHeadingText(currentNode) === target.text &&
        Number(currentNode.attrs.level) === target.level)
    ) {
      return target.pos;
    }
  }

  const headings = extractEditorOutline(doc);
  if (target.nodeId) {
    const matched = headings.find(
      (heading) => heading.nodeId === target.nodeId,
    );
    if (matched) return matched.pos;
  }
  return headings[target.index]?.pos ?? null;
}

/** 查找选区之前最近的标题序号。 */
export function findActiveHeadingIndex(
  headings: readonly EditorOutlineHeading[],
  selectionHead: number,
): number | null {
  let activeIndex: number | null = null;
  for (const heading of headings) {
    if (heading.pos > selectionHead) break;
    activeIndex = heading.index;
  }
  return activeIndex;
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
