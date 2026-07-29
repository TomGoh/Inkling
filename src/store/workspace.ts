// 工作区状态管理
// 当前打开的工作区（文件夹）、文件树、当前编辑的文件

import { create } from "zustand";
import { listDir, readTextFile, writeTextFile, type FileNode } from "../lib/fs";

interface WorkspaceState {
  /** 工作区根路径（null 表示未打开） */
  rootPath: string | null;
  /** 文件树根节点 */
  tree: FileNode | null;
  /** 加载中标志 */
  loading: boolean;
  /** 当前打开的文件路径（null 表示未打开） */
  currentFile: string | null;
  /** 当前文件内容 */
  currentContent: string;
  /** 文件是否被修改（未保存） */
  dirty: boolean;
  /** 保存中标志 */
  saving: boolean;
  /** 最近一次保存的错误（null 表示无错误） */
  saveError: string | null;
  /** 最近一次保存时间戳（ms） */
  lastSavedAt: number | null;
  /** 当前光标所在标题的 slug（用于大纲高亮，null 表示无） */
  currentHeadingSlug: string | null;

  /** 打开工作区：读取目录树 */
  openWorkspace: (dirPath: string) => Promise<void>;
  /** 打开文件：读取内容并设为当前 */
  openFile: (filePath: string) => Promise<void>;
  /** 更新当前内容（编辑器变更时调用） */
  setContent: (content: string) => void;
  /** 保存当前文件到磁盘 */
  saveCurrent: () => Promise<void>;
  /** 设置当前光标所在标题 slug（编辑器选区变化时调用） */
  setCurrentHeadingSlug: (slug: string | null) => void;
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  rootPath: null,
  tree: null,
  loading: false,
  currentFile: null,
  currentContent: "",
  dirty: false,
  saving: false,
  saveError: null,
  lastSavedAt: null,
  currentHeadingSlug: null,

  openWorkspace: async (dirPath) => {
    set({ loading: true });
    try {
      const tree = await listDir(dirPath);
      set({ rootPath: dirPath, tree, loading: false });
    } catch (e) {
      set({ loading: false });
      throw e;
    }
  },

  openFile: async (filePath) => {
    // 切换前若有未保存内容，任务4会处理提示；任务3直接切换
    set({ loading: true });
    try {
      const content = await readTextFile(filePath);
      set({
        currentFile: filePath,
        currentContent: content,
        dirty: false,
        saveError: null,
        loading: false,
      });
    } catch (e) {
      set({ loading: false });
      throw e;
    }
  },

  setContent: (content) => {
    const { currentContent } = get();
    if (content === currentContent) return;
    set({ currentContent: content, dirty: true });
  },

  saveCurrent: async () => {
    const { currentFile, currentContent, dirty, saving } = get();
    if (!currentFile) return;
    if (!dirty || saving) return;
    set({ saving: true, saveError: null });
    try {
      await writeTextFile(currentFile, currentContent);
      set({
        saving: false,
        dirty: false,
        saveError: null,
        lastSavedAt: Date.now(),
      });
    } catch (e) {
      set({
        saving: false,
        saveError: e instanceof Error ? e.message : String(e),
      });
    }
  },

  setCurrentHeadingSlug: (slug) => {
    if (slug === get().currentHeadingSlug) return;
    set({ currentHeadingSlug: slug });
  },
}));
