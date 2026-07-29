import type { NodeView } from "@milkdown/kit/prose/view";
import type { Node } from "@milkdown/kit/prose/model";
import { $view } from "@milkdown/kit/utils";
import { imageSchema } from "@milkdown/kit/preset/commonmark";
import { resolveImageSrc } from "../../lib/fs";
import { useWorkspace } from "../../store/workspace";

/**
 * 图片节点视图。
 * commonmark 的 image 默认把 src 原样输出到 <img>，但相对路径（如 assets/x.png）
 * 在 WebView 里无法加载。这里把相对路径解析为工作区绝对路径后用 convertFileSrc 转换，
 * 使本地图片可正常显示，同时 markdown 源码仍保持相对路径引用（便于迁移）。
 */
class ImageNodeView implements NodeView {
  dom: HTMLImageElement;
  private node: Node;

  constructor(node: Node) {
    this.node = node;
    this.dom = document.createElement("img");
    this.dom.className = "milkdown-image";
    this.dom.loading = "lazy";
    this.render();
  }

  private render() {
    const rootPath = useWorkspace.getState().rootPath;
    this.dom.src = resolveImageSrc(this.node.attrs.src ?? "", rootPath);
    this.dom.alt = this.node.attrs.alt ?? "";
    if (this.node.attrs.title) this.dom.title = this.node.attrs.title;
  }

  update(node: Node): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  stopEvent() {
    return true;
  }

  ignoreMutation() {
    return true;
  }
}

/** 图片 NodeView 插件：相对路径转可加载 URL */
export const imageView = $view(imageSchema.node, () => (node) => new ImageNodeView(node));
