// 工作区状态管理
// 当前打开的工作区（文件夹）、文件树、多标签页编辑
// currentFile / currentContent / dirty 等始终是「活跃 tab」的镜像，
// 切换 tab 时同步更新，保持下游组件接口不变。

import { create } from "zustand";
import { listDir, readTextFile, writeTextFile, type FileNode } from "../lib/fs";

/** 单个打开的标签页 */
export interface OpenTab {
  /** 文件完整路径 */
  path: string;
  /** 文件内容 */
  content: string;
  /** 是否未保存 */
  dirty: boolean;
  /** 最近一次保存时间戳（ms），null 表示从未保存 */
  lastSavedAt: number | null;
}

interface WorkspaceState {
  /** 工作区根路径（null 表示未打开） */
  rootPath: string | null;
  /** 文件树根节点 */
  tree: FileNode | null;
  /** 加载中标志 */
  loading: boolean;

  /** 已打开的标签页列表 */
  openTabs: OpenTab[];
  /** 当前活跃标签页路径（null 表示无活跃 tab） */
  activeTabPath: string | null;

  // 以下为活跃 tab 的镜像，便于现有组件直接订阅
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
  /** 打开文件：已打开则切换到对应 tab，否则读取内容新增 tab */
  openFile: (filePath: string) => Promise<void>;
  /** 切换活跃标签页 */
  switchTab: (filePath: string) => void;
  /** 关闭标签页（若关闭的是活跃 tab，自动激活相邻 tab） */
  closeTab: (filePath: string) => void;
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
  openTabs: [],
  activeTabPath: null,
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
    const { openTabs } = get();
    // 已打开：直接切换，不重复读取
    const existing = openTabs.find((t) => t.path === filePath);
    if (existing) {
      get().switchTab(filePath);
      return;
    }
    // 未打开：读取内容并新增 tab
    set({ loading: true });
    try {
      const content = await readTextFile(filePath);
      const tab: OpenTab = {
        path: filePath,
        content,
        dirty: false,
        lastSavedAt: null,
      };
      set({
        openTabs: [...get().openTabs, tab],
        activeTabPath: filePath,
        currentFile: filePath,
        currentContent: content,
        dirty: false,
        saveError: null,
        lastSavedAt: null,
        currentHeadingSlug: null,
        loading: false,
      });
    } catch (e) {
      set({ loading: false });
      throw e;
    }
  },

  switchTab: (filePath) => {
    const tab = get().openTabs.find((t) => t.path === filePath);
    if (!tab) return;
    set({
      activeTabPath: filePath,
      currentFile: tab.path,
      currentContent: tab.content,
      dirty: tab.dirty,
      lastSavedAt: tab.lastSavedAt,
      saveError: null,
      // 切换 tab 时重置大纲高亮，等编辑器更新后由 tracker 重新计算
      currentHeadingSlug: null,
    });
  },

  closeTab: (filePath) => {
    const { openTabs, activeTabPath } = get();
    const idx = openTabs.findIndex((t) => t.path === filePath);
    if (idx === -1) return;
    const nextTabs = openTabs.filter((t) => t.path !== filePath);

    // 关闭的是活跃 tab：选择相邻 tab 激活
    if (activeTabPath === filePath) {
      if (nextTabs.length === 0) {
        // 没有剩余 tab
        set({
          openTabs: nextTabs,
          activeTabPath: null,
          currentFile: null,
          currentContent: "",
          dirty: false,
          lastSavedAt: null,
          saveError: null,
          currentHeadingSlug: null,
        });
      } else {
        // 优先激活右边的（原 idx 位置），越界则取最后一个
        const nextIdx = Math.min(idx, nextTabs.length - 1);
        const next = nextTabs[nextIdx];
        set({
          openTabs: nextTabs,
          activeTabPath: next.path,
          currentFile: next.path,
          currentContent: next.content,
          dirty: next.dirty,
          lastSavedAt: next.lastSavedAt,
          saveError: null,
          currentHeadingSlug: null,
        });
      }
    } else {
      // 关闭的不是活跃 tab，只更新列表
      set({ openTabs: nextTabs });
    }
  },

  setContent: (content) => {
    const { currentContent, activeTabPath, openTabs } = get();
    if (content === currentContent) return;
    // 更新活跃 tab 的内容与 dirty
    if (activeTabPath) {
      const nextTabs = openTabs.map((t) =>
        t.path === activeTabPath ? { ...t, content, dirty: true } : t,
      );
      set({ openTabs: nextTabs, currentContent: content, dirty: true });
    } else {
      set({ currentContent: content, dirty: true });
    }
  },

  saveCurrent: async () => {
    const { currentFile, currentContent, dirty, saving, activeTabPath, openTabs } = get();
    if (!currentFile) return;
    if (!dirty || saving) return;
    set({ saving: true, saveError: null });
    try {
      await writeTextFile(currentFile, currentContent);
      const now = Date.now();
      // 同步活跃 tab 的保存状态
      if (activeTabPath) {
        const nextTabs = openTabs.map((t) =>
          t.path === activeTabPath
            ? { ...t, dirty: false, lastSavedAt: now }
            : t,
        );
        set({ openTabs: nextTabs });
      }
      set({
        saving: false,
        dirty: false,
        saveError: null,
        lastSavedAt: now,
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
