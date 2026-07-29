// 图片拖拽/粘贴上传插件
// 拦截编辑器的 drop 和 paste 事件，将图片文件复制到工作区 assets/ 目录，
// 并在编辑器中插入相对路径引用的图片节点。
// markdown 源码保持相对路径（assets/xxx.png），便于整个工作区迁移。

import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { writeBinaryFile, joinPath } from "../../lib/fs";
import { useWorkspace } from "../../store/workspace";

const key = new PluginKey("inkling-image-upload");

/** 支持的图片扩展名 */
const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"];

function isImageFile(file: File): boolean {
  if (file.type && file.type.startsWith("image/")) return true;
  const name = file.name.toLowerCase();
  return IMAGE_EXTS.some((ext) => name.endsWith(ext));
}

/** 生成唯一文件名：时间戳 + 随机串 + 原扩展名 */
function genImageName(file: File): string {
  const m = file.name.match(/(\.[^.]+)$/);
  const ext = m ? m[1].toLowerCase() : ".png";
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}${ext}`;
}

/**
 * 将图片文件写入工作区 assets/ 并在编辑器中插入图片节点。
 * @param files 图片文件列表
 * @param view ProseMirror 编辑器视图
 * @param pos 插入位置（drop 时由坐标计算，paste 时为 null 用当前选区）
 * @param rootPath 工作区根路径
 */
async function insertImages(
  files: File[],
  view: EditorView,
  pos: number | null,
  rootPath: string,
): Promise<void> {
  const imageFiles = files.filter(isImageFile);
  if (imageFiles.length === 0) return;

  const assetsDir = joinPath(rootPath, "assets");
  let insertPos = pos;

  for (const file of imageFiles) {
    try {
      const buf = await file.arrayBuffer();
      const name = genImageName(file);
      const fullPath = joinPath(assetsDir, name);
      await writeBinaryFile(fullPath, new Uint8Array(buf));

      // markdown 中用正斜杠相对路径（跨平台兼容）
      const relSrc = `assets/${name}`;
      const alt = file.name.replace(/\.[^.]+$/, "") || "image";
      const node = view.state.schema.nodes.image.create({ src: relSrc, alt });

      const tr = view.state.tr;
      if (insertPos != null) {
        tr.insert(insertPos, node);
        insertPos += node.nodeSize;
      } else {
        tr.replaceSelectionWith(node);
      }
      view.dispatch(tr);
    } catch (e) {
      console.error("图片插入失败:", file.name, e);
    }
  }
  view.focus();
}

/**
 * 图片上传 ProseMirror 插件。
 * - handleDrop：从系统文件管理器拖入图片，插入到鼠标释放位置
 * - handlePaste：粘贴剪贴板图片（截图等），插入到当前光标位置
 */
export const imageUploadPlugin = () =>
  new Plugin({
    key,
    props: {
      handleDrop: (view, event: DragEvent) => {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;
        if (!Array.from(files).some(isImageFile)) return false;

        const rootPath = useWorkspace.getState().rootPath;
        if (!rootPath) return false;

        event.preventDefault();
        const coords = { left: event.clientX, top: event.clientY };
        const pos = view.posAtCoords(coords)?.pos ?? null;
        void insertImages(Array.from(files), view, pos, rootPath);
        return true;
      },
      handlePaste: (view, event: ClipboardEvent) => {
        const files = event.clipboardData?.files;
        if (!files || files.length === 0) return false;
        if (!Array.from(files).some(isImageFile)) return false;

        const rootPath = useWorkspace.getState().rootPath;
        if (!rootPath) return false;

        event.preventDefault();
        void insertImages(Array.from(files), view, null, rootPath);
        return true;
      },
    },
  });
