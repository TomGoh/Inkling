// HTML 嵌入渲染
// commonmark 预设的 htmlSchema 是 inline atom 节点，默认把 HTML 当纯文本展示。
// 本文件用 $view 覆盖其 NodeView，通过白名单 DOMParser 真正渲染受支持的 HTML 标签。
//
// 安全：白名单标签 + 白名单属性 + 白名单 CSS 属性，过滤 script/on*/javascript: 等危险内容。
// 性能：解析结果按 value 缓存（LRU 200 条），相同 value 不重复解析；update 比对 value 不变直接跳过。
// markdown 源码保持原始 HTML 文本，可被 GitHub 等直接消费。

import { $view } from "@milkdown/kit/utils";
import type { NodeView, NodeViewConstructor } from "@milkdown/kit/prose/view";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { htmlSchema } from "@milkdown/kit/preset/commonmark";

/** 允许的行内/块级标签白名单 */
const ALLOWED_TAGS = new Set([
  // 行内
  "span", "a", "b", "i", "u", "s", "em", "strong", "code", "kbd", "sub", "sup",
  "small", "mark", "br", "abbr", "cite", "q", "time", "var", "samp",
  // 块级（在 inline atom 内用 inline-block 呈现）
  "div", "p", "details", "summary", "blockquote", "pre", "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6", "hr", "table", "thead", "tbody", "tr", "th", "td",
  // 图片与 SVG 图形
  "img", "svg", "g", "path", "circle", "rect", "line", "polygon", "polyline", "ellipse", "text", "tspan", "defs", "use", "clippath", "style", "marker", "foreignobject",
  "lineargradient", "radialgradient", "stop", "pattern", "mask", "filter", "fegaussianblur", "feoffset", "femerge", "femergenode", "fecomposite", "fecomponenttransfer", "fefunca", "fefuncr", "fefuncg", "fefuncb"
]);

const SVG_TAGS = new Set([
  "svg", "g", "path", "circle", "rect", "line", "polygon", "polyline", "ellipse", "text", "tspan", "defs", "use", "clippath", "marker", "foreignobject",
  "lineargradient", "radialgradient", "stop", "pattern", "mask", "filter", "fegaussianblur", "feoffset", "femerge", "femergenode", "fecomposite", "fecomponenttransfer", "fefunca", "fefuncr", "fefuncg", "fefuncb"
]);

const SVG_NS = "http://www.w3.org/2000/svg";

/** 允许的全局属性白名单 */
const ALLOWED_GLOBAL_ATTRS = new Set([
  "class", "style", "title", "id", "lang", "dir", "role", "aria-label", "aria-hidden", "aria-describedby", "tabindex",
  // SVG 常用属性
  "viewbox", "xmlns", "xmlns:xlink", "xlink:href", "width", "height", "fill", "stroke", "stroke-width",
  "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-opacity", "fill-opacity", "fill-rule", "clip-rule",
  "d", "cx", "cy", "r", "rx", "ry", "x", "y", "dx", "dy", "x1", "y1", "x2", "y2", "points",
  "transform", "font-family", "font-size", "font-weight", "text-anchor",
  "dominant-baseline", "alignment-baseline", "marker-start", "marker-end", "marker-mid",
  "markerwidth", "markerheight", "refx", "refy", "orient", "markerunits",
  "offset", "stop-color", "stop-opacity", "gradientunits", "gradienttransform", "spreadmethod",
  "maskunits", "maskcontentunits", "patternunits", "patterntransform",
  "preserveaspectratio", "clippathunits", "overflow", "version", "baseprofile",
]);

/** 特定标签的额外允许属性 */
const ALLOWED_TAG_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "target", "rel"]),
  img: new Set(["src", "alt", "width", "height"]),
  time: new Set(["datetime"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan", "scope"]),
  details: new Set(["open"]),
};

/** 允许的 CSS 属性白名单（小写） */
const ALLOWED_CSS_PROPS = new Set([
  "color", "background-color", "background", "font-weight", "font-style",
  "font-size", "font-family", "text-decoration", "text-align", "text-transform",
  "line-height", "letter-spacing", "word-spacing", "white-space",
  "border", "border-color", "border-radius", "border-width", "border-style",
  "padding", "padding-left", "padding-right", "padding-top", "padding-bottom",
  "margin", "margin-left", "margin-right", "margin-top", "margin-bottom",
  "display", "width", "height", "max-width", "max-height", "min-width", "min-height",
  "overflow", "cursor", "opacity", "box-shadow", "vertical-align", "list-style",
  "text-indent", "word-break", "overflow-wrap", "text-shadow",
]);

function isHtmlTagInsideSvg(tag: string): boolean {
  return !SVG_TAGS.has(tag);
}

/** 危险属性前缀（on* 事件处理器） */
function isDangerousAttr(name: string): boolean {
  return name.toLowerCase().startsWith("on");
}

/** 检查 URL 是否安全（禁止 javascript: data: 协议，允许 http/https/mailto/锚点/相对路径） */
function isSafeUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  if (trimmed === "") return true;
  // 锚点、相对路径、协议白名单
  if (trimmed.startsWith("#") || trimmed.startsWith("/") || trimmed.startsWith("?")) return true;
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return true;
  // data: 仅允许图片类型
  if (/^data:image\//i.test(trimmed)) return true;
  return false;
}

/** 过滤 style 字符串，仅保留白名单 CSS 属性，移除危险值（expression/url(javascript:)） */
function sanitizeStyle(style: string): string {
  const decls: string[] = [];
  for (const raw of style.split(";")) {
    const idx = raw.indexOf(":");
    if (idx === -1) continue;
    const prop = raw.slice(0, idx).trim().toLowerCase();
    const val = raw.slice(idx + 1).trim();
    if (!prop || !val) continue;
    if (!ALLOWED_CSS_PROPS.has(prop)) continue;
    // 拦截 CSS 注入：expression()、javascript:、behavior
    const valLower = val.toLowerCase();
    if (valLower.includes("expression(")) continue;
    if (valLower.includes("javascript:")) continue;
    if (valLower.includes("behavior:")) continue;
    if (valLower.includes("-moz-binding")) continue;
    decls.push(`${prop}: ${val}`);
  }
  return decls.join("; ");
}

/** 块级标签集合（用于判断渲染容器 display） */
const BLOCK_TAG_PATTERN = /<\s*(div|p|details|summary|blockquote|pre|ul|ol|li|h[1-6]|hr|table|thead|tbody|tr|th|td)\b/i;

/** LRU 缓存：value -> sanitized DocumentFragment 克隆。限制 200 条避免内存膨胀 */
const SANITIZE_CACHE = new Map<string, globalThis.Node>();
const CACHE_LIMIT = 200;

function cacheGet(key: string): globalThis.Node | undefined {
  const node = SANITIZE_CACHE.get(key);
  if (node !== undefined) {
    // 命中则移到末尾（Map 保持插入顺序，删后重插即 LRU）
    SANITIZE_CACHE.delete(key);
    SANITIZE_CACHE.set(key, node);
  }
  return node;
}

function cacheSet(key: string, node: globalThis.Node): void {
  if (SANITIZE_CACHE.size >= CACHE_LIMIT) {
    // 淘汰最旧（首个）
    const oldest = SANITIZE_CACHE.keys().next().value;
    if (oldest !== undefined) SANITIZE_CACHE.delete(oldest);
  }
  SANITIZE_CACHE.set(key, node);
}

/** 判断 HTML 片段是否包含块级标签（决定外层容器用 block 还是 inline） */
function containsBlockTag(html: string): boolean {
  return BLOCK_TAG_PATTERN.test(html);
}

/**
 * 解析并过滤 HTML 字符串为安全的 DocumentFragment。
 * 用 DOMParser（不执行脚本、不加载资源）解析，白名单遍历克隆。
 * 导出供测试验证白名单过滤逻辑。
 */
export function sanitizeHTML(value: string): globalThis.Node {
  const cached = cacheGet(value);
  if (cached) return cached.cloneNode(true);

  // DOMParser 解析不执行 script，比 innerHTML 安全
  const doc = new DOMParser().parseFromString(value, "text/html");
  const fragment = document.createDocumentFragment();

  // 递归过滤克隆节点
  const cloneFiltered = (src: Element, parent: globalThis.Node, isInsideSvg = false): void => {
    const tag = src.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return; // 不在白名单的标签直接丢弃（不保留子节点，避免结构混乱）

    // foreignObject 内的子元素属于 HTML 命名空间（例如 span.nodeLabel、div 等）
    const isSvgTag = SVG_TAGS.has(tag);
    const inSvg = isSvgTag ? true : isInsideSvg && tag !== "foreignobject";
    const useSvgNs = isSvgTag || (isInsideSvg && tag !== "foreignobject" && !isHtmlTagInsideSvg(tag));

    // SVG 元素必须用 SVG 命名空间创建，否则浏览器会当作未知 HTML 标签，无法正常渲染矢量图形
    const el = useSvgNs
      ? document.createElementNS(SVG_NS, tag)
      : document.createElement(tag);

    // 过滤属性
    for (const attr of Array.from(src.attributes)) {
      const rawName = attr.name;
      const lowerName = rawName.toLowerCase();
      if (isDangerousAttr(lowerName)) continue;
      const allowed =
        ALLOWED_GLOBAL_ATTRS.has(lowerName) ||
        ALLOWED_TAG_ATTRS[tag]?.has(lowerName);
      if (!allowed) continue;

      let val = attr.value;
      // href/src 做协议检查
      if ((lowerName === "href" || lowerName === "src") && !isSafeUrl(val)) continue;
      // style 单独过滤
      if (lowerName === "style") {
        val = sanitizeStyle(val);
        if (!val) continue;
      }
      el.setAttribute(rawName, val);
    }

    // a 标签强制安全：外链加 rel=noopener，target=_blank 时补充
    if (tag === "a" && el.getAttribute("target") === "_blank") {
      el.setAttribute("rel", "noopener noreferrer");
    }

    parent.appendChild(el);

    // 递归子节点
    for (const child of Array.from(src.childNodes)) {
      if (child.nodeType === globalThis.Node.TEXT_NODE) {
        el.appendChild(document.createTextNode(child.textContent ?? ""));
      } else if (child.nodeType === globalThis.Node.ELEMENT_NODE) {
        cloneFiltered(child as Element, el, inSvg);
      }
    }
  };

  for (const child of Array.from(doc.body.childNodes)) {
    if (child.nodeType === globalThis.Node.TEXT_NODE) {
      fragment.appendChild(document.createTextNode(child.textContent ?? ""));
    } else if (child.nodeType === globalThis.Node.ELEMENT_NODE) {
      cloneFiltered(child as Element, fragment, false);
    }
  }

  // 缓存原始 fragment（非克隆）
  cacheSet(value, fragment);
  return fragment.cloneNode(true);
}

/** 创建 HTML 节点 NodeView：白名单渲染受支持的 HTML 标签 */
function createHtmlView(): NodeViewConstructor {
  return (node: PMNode): NodeView => {
    const value = (node.attrs.value as string) ?? "";
    const isBlock = containsBlockTag(value);

    // 外层容器：inline atom 节点需 inline 容器保持文档结构合法；
    // 块级 HTML 用 inline-block 呈现块级视觉但不破坏段落结构
    const dom = document.createElement("span");
    dom.className = "html-inline";
    dom.setAttribute("data-type", "html");
    dom.setAttribute("data-value", value);
    if (isBlock) {
      dom.style.display = "inline-block";
      dom.classList.add("html-block");
    }

    let current = value;
    const render = (v: string) => {
      dom.innerHTML = "";
      if (!v.trim()) return;
      try {
        const fragment = sanitizeHTML(v);
        dom.appendChild(fragment);
      } catch {
        // 解析失败回退为纯文本展示
        dom.textContent = v;
      }
    };
    render(current);

    return {
      dom,
      // atom 节点不提供 contentDOM
      ignoreMutation: () => true,
      stopEvent: () => false,
      update: (next: PMNode) => {
        if (next.type.name !== "html") return false;
        const nextValue = (next.attrs.value as string) ?? "";
        if (nextValue === current) return true; // 值未变，跳过重渲染
        current = nextValue;
        render(nextValue);
        return true;
      },
      destroy: () => {},
    };
  };
}

/** 覆盖 commonmark htmlSchema 的 NodeView，启用 HTML 真实渲染 */
export const htmlView = $view(htmlSchema.node, () => createHtmlView());
