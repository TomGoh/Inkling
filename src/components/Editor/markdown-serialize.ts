// 写盘前的文档规整（#268）
//
// 背景：Milkdown 的 list_item schema 是 `paragraph block*`——列表项**必须**以段落开头。
// 所以「首块是子列表」的列表项（中间态 Markdown `- - a` / `- 3. a`，源自 HTML
// `<ul><li><ul><li>a</li></ul></li></ul>`）解析后，一定带一个 schema 补出来的空段落：
// `bullet_list > list_item > [paragraph(空), sub_list]`。它不代表用户的任何内容。
//
// 而 Milkdown 的 paragraph 序列化器会把「不是文档末尾的空段落」写成字面 `<br />`
// （preset-commonmark 的 remark-preserve-empty-line 行为），于是这个补出来的空段落
// 被当成用户手写的空行落进源码：
//
//   `- - a`  →  粘贴后保存一次  →  "* <br />\n\n  * a\n"
//
// 两处危害：① 用户的 Markdown 源文件里出现原始 HTML 标签 `<br />`（源码模式可见）；
// ② 序列化插进去的空行让该列表项重开后变成松散项（list_item.spread false → true）。
//
// 修复：序列化前把这种「结构占位空段落」剔除。判据是「空段落 + 它是 list_item 的首个子
// 节点 + 该列表项后面还有别的块」——此时空段落只能是 schema 补出来的占位（用户无内容可
// 对应）。重新解析同一份 Markdown 时 schema 会把它补回来，因此文本与结构无损。
//
// 为什么必须是「后面还有块」这个附加条件：唯一子节点就是空段落时，它代表的是
// 「空列表项」（裸标记 `-`）本身的内容，剔除后 mdast-util-to-markdown 拿到空 listItem
// 会抛 `Cannot read properties of undefined`（实测）。那种形态不在本 issue 范围内。
//
// 想验证「这个空段落是 schema 补的、不是用户写的」：任何 Markdown 形态都无法让
// list_item 以子列表开头而不被补空段落——`- - a` 与 `-\n  - a` 解析结果完全相同（实测），
// 所以修复点只能在序列化侧，转换器（html-to-markdown.ts）的输出无需改动。

import { Fragment, type Node as PMNode } from "@milkdown/kit/prose/model";

/** list_item 首部、且其后还有块的空段落 = schema 补出来的结构占位段落 */
function hasPlaceholderParagraph(node: PMNode): boolean {
  return (
    node.type.name === "list_item" &&
    node.childCount > 1 &&
    node.firstChild !== null &&
    node.firstChild.type.name === "paragraph" &&
    node.firstChild.content.size === 0
  );
}

function rebuild(node: PMNode): PMNode {
  if (node.isLeaf || node.childCount === 0) return node;
  const children: PMNode[] = [];
  node.forEach((child, _offset, index) => {
    if (index === 0 && hasPlaceholderParagraph(node)) return;
    children.push(rebuild(child));
  });
  return node.copy(Fragment.fromArray(children));
}

/**
 * 剔除列表项首部的结构占位空段落（#268）。
 *
 * 文档里没有这种段落时原样返回**同一个** doc 实例（不做任何重建），
 * 避免给「每次保存/防抖序列化都要跑一遍」的路径增加无谓开销。
 */
export function stripListPlaceholderParagraphs(doc: PMNode): PMNode {
  let found = false;
  doc.descendants((node) => {
    if (found) return false;
    if (hasPlaceholderParagraph(node)) found = true;
    return !found;
  });
  return found ? rebuild(doc) : doc;
}
