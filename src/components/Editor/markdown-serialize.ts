// 写盘前的文档规整（#268 / #272）
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
// 修复（#268）：序列化前把这种「结构占位空段落」剔除。判据是「空段落 + 它是 list_item
// 的首个子节点 + 该列表项后面还有别的块」——此时空段落只能是 schema 补出来的占位（用户
// 无内容可对应）。重新解析同一份 Markdown 时 schema 会把它补回来，因此文本与结构无损。
//
// 为什么必须是「后面还有块」这个附加条件：唯一子节点就是空段落时，它代表的是
// 「空列表项」（裸标记 `-`）**本身的内容**，剔除后 mdast listItem 会变成没有 `children`
// 字段的空节点，mdast-util-gfm-task-list-item 的 `node.children[0]` 直接抛
// `Cannot read properties of undefined`（实测）。那种形态由下面的第二条规则处理。
//
// 修复（#272）：空列表项（裸标记 `-`，唯一子节点是空段落）反过来是**不能删段落**的，
// 但它同样会被写成 `* <br />`。这里改成「保留段落、换掉段落内容」：给段落塞一个
// **空值 html 锚点**（`html` 节点 attr `value: ""`），它在 mdast 里是 `{ type: "html" }`、
// 序列化出零长度字符串——于是段落渲染为空、列表项只剩裸标记 `*`（有序为 `1.`）。
//
//   `-`  →  保存  →  "*\n"
//
// 选 html 空值节点而不是「删段落」或塞可见字符的原因：
// - 删段落会让 mdast listItem 没有 `children`（见上），且 schema `paragraph block*` 本也
//   不允许空列表项；
// - 塞任何可见字符都会污染用户源码；
// - `html` 是 schema 里唯一「可以是原子 inline 节点、又能序列化成零长度」的类型。
//
// 修复（#284）：任务列表项（`checked` 为布尔）的空段落形态**不能**用上面的空值锚点——
// 任务列表项同样会被写成 `* [ ] <br />`，而 mdast 侧靠
// `value.replace(/^(?:[*+-]|\d+\.)([\r\n]| {1,3})/, …)` 把 `[ ] ` 插到裸标记之后：
// 空值锚点让段落渲染成空串、列表项只剩裸标记 `*`（后面既不是换行也不是空格）→ 正则匹配
// 不上 → checkbox 整块丢失（实测 `* [ ] <br />` → `*`，比保留 `<br />` 更糟）。
// 换成**非空**锚点 `<!-- -->` 即可：列表项值是 `* <!-- -->` → 正则命中 → 输出
// `* [ ] <!-- -->`，checkbox 保住；注释在渲染侧不可见（见 TASK_ITEM_ANCHOR）。
// 普通（非任务）空列表项继续用空值锚点，保持裸标记输出不变。
//
// 想验证「这个空段落是 schema 补的、不是用户写的」：任何 Markdown 形态都无法让
// list_item 以子列表开头而不被补空段落——`- - a` 与 `-\n  - a` 解析结果完全相同（实测），
// 所以修复点只能在序列化侧，转换器（html-to-markdown.ts）的输出无需改动。

import { Fragment, type Node as PMNode, type NodeType } from "@milkdown/kit/prose/model";

/** list_item 首部、且其后还有块的空段落 = schema 补出来的结构占位段落（#268） */
function hasPlaceholderParagraph(node: PMNode): boolean {
  return (
    node.type.name === "list_item" &&
    node.childCount > 1 &&
    node.firstChild !== null &&
    node.firstChild.type.name === "paragraph" &&
    node.firstChild.content.size === 0
  );
}

/** 唯一子节点是空段落的 list_item = 空列表项（裸标记 `-`）（#272） */
function isEmptyListItem(node: PMNode): boolean {
  return (
    node.type.name === "list_item" &&
    node.childCount === 1 &&
    node.firstChild !== null &&
    node.firstChild.type.name === "paragraph" &&
    node.firstChild.content.size === 0
  );
}

/** 任务列表项（GFM `[ ]` / `[x]`）：空段落形态要用非空锚点，见 TASK_ITEM_ANCHOR（#284） */
function isTaskListItem(node: PMNode): boolean {
  return typeof node.attrs.checked === "boolean";
}

/**
 * 任务列表项空段落的**非空**锚点（#284）。
 *
 * 为什么不能空：见文件头「修复（#284）」——空值锚点会让 mdast 侧的任务项正则匹配不上，
 * checkbox 整块丢失。
 * 为什么用 `<!-- -->`：与 #249 / #264 / #266 / #273 同一个锚点，html-view 的白名单遍历
 * 只保留文本与元素节点、注释被丢弃，在编辑器里不产生可见字符（往返 parse → serialize 幂等）。
 */
const TASK_ITEM_ANCHOR = "<!-- -->";

/**
 * 把空列表项的段落内容换成 html 锚点，让它序列化成零长度（普通项）或纯注释（任务项）。
 *
 * 锚点只在写盘副本上存在，编辑器里的文档仍是原来的空段落，因此不影响编辑态。
 */
function anchorEmptyListItem(node: PMNode, htmlType: NodeType, anchor: string): PMNode {
  const paragraph = node.firstChild!;
  return node.copy(
    Fragment.fromArray([
      paragraph.type.create(paragraph.attrs, Fragment.fromArray([htmlType.create({ value: anchor })])),
    ]),
  );
}

function rebuild(node: PMNode, htmlType: NodeType | undefined): PMNode {
  if (node.isLeaf || node.childCount === 0) return node;

  if (htmlType && isEmptyListItem(node)) {
    // 任务项必须用非空锚点，否则 checkbox 会在 mdast 侧的正则里丢掉（#284）
    return anchorEmptyListItem(node, htmlType, isTaskListItem(node) ? TASK_ITEM_ANCHOR : "");
  }

  const children: PMNode[] = [];
  node.forEach((child, _offset, index) => {
    if (index === 0 && hasPlaceholderParagraph(node)) {
      // 任务项的首部空段落**不能**剔除（#286）：GFM 的 checkbox 前缀要求 listItem.children[0]
      // 是段落（mdast-util-gfm-task-list-item 的 checkable 判据），剔除后前缀整块丢失——
      // 实测 `* [ ] <br />\n  * 子项` 保存成 `* * 子项`，勾选项永久退化成普通列表。
      // 改成给空段落填 TASK_ITEM_ANCHOR（非空）：段落保留、标记有处依附，checkbox 不再丢。
      if (htmlType && isTaskListItem(node)) {
        const paragraph = node.firstChild!;
        children.push(
          paragraph.type.create(
            paragraph.attrs,
            Fragment.fromArray([htmlType.create({ value: TASK_ITEM_ANCHOR })]),
          ),
        );
        return;
      }
      return;
    }
    children.push(rebuild(child, htmlType));
  });
  return node.copy(Fragment.fromArray(children));
}

/**
 * 写盘前的列表项规整：
 * 1. 剔除列表项首部的结构占位空段落（#268），避免字面 `<br />` 与意外的松散项；
 * 2. 空列表项改写成 html 锚点，避免裸标记被写成 `* <br />`（#272）：
 *    普通项用空值锚点序列化成裸标记，任务项用非空锚点保住 checkbox（#284）。
 *
 * 文档里没有这两种形态时原样返回**同一个** doc 实例（不做任何重建），
 * 避免给「每次保存/防抖序列化都要跑一遍」的路径增加无谓开销。
 */
export function normalizeListPlaceholders(doc: PMNode): PMNode {
  const htmlType = doc.type.schema?.nodes?.html;
  let found = false;
  doc.descendants((node) => {
    if (found) return false;
    if (hasPlaceholderParagraph(node) || (htmlType && isEmptyListItem(node))) {
      found = true;
    }
    return !found;
  });
  return found ? rebuild(doc, htmlType) : doc;
}
