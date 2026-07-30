// 工作区状态管理
// 当前打开的工作区（文件夹）、文件树、多标签页编辑
// currentFile / currentContent / dirty 等始终是「活跃 tab」的镜像，
// 切换 tab 时同步更新，保持下游组件接口不变。

import { create } from "zustand";
import { listDir, readTextFile, writeTextFile, type FileNode } from "../lib/fs";

/** 最近打开文件列表的持久化 key */
const RECENT_FILES_KEY = "inkling-recent-files";
const RECENT_FILES_MAX = 10;

/** 读取持久化的最近文件列表 */
function loadRecentFiles(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_FILES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as string[];
    return Array.isArray(arr) ? arr.slice(0, RECENT_FILES_MAX) : [];
  } catch {
    return [];
  }
}

/** 持久化最近文件列表 */
function persistRecentFiles(files: string[]): void {
  try {
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(files.slice(0, RECENT_FILES_MAX)));
  } catch {
    // 忽略写入失败
  }
}

/** 把 path 推到列表头部并去重，截断到最大长度 */
function pushRecent(list: string[], path: string): string[] {
  const next = [path, ...list.filter((p) => p !== path)];
  return next.slice(0, RECENT_FILES_MAX);
}

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
  /** 编辑位置记忆：光标在文档中的偏移（null 表示未记录） */
  cursorPos: number | null;
  /** 编辑位置记忆：编辑器滚动条垂直偏移（null 表示未记录） */
  scrollTop: number | null;
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

  /** 最近打开的文件路径列表（最多 10 个，最新在前） */
  recentFiles: string[];

  /** 打开工作区：读取目录树 */
  openWorkspace: (dirPath: string) => Promise<void>;
  /** 打开文件：已打开则切换到对应 tab，否则读取内容新增 tab */
  openFile: (filePath: string) => Promise<void>;
  /** 切换活跃标签页 */
  switchTab: (filePath: string) => void;
  /** 关闭标签页（若关闭的是活跃 tab，自动激活相邻 tab） */
  closeTab: (filePath: string) => void;
  /** 关闭除指定 tab 外的所有 tab（不处理未保存确认，由调用方负责） */
  closeOthers: (keepPath: string) => void;
  /** 关闭指定 tab 右侧的所有 tab（不含指定 tab 本身） */
  closeToRight: (fromPath: string) => void;
  /** 关闭所有 tab */
  closeAll: () => void;
  /** 拖拽重排：把 fromPath 的 tab 移到 toPath 之前 */
  reorderTabs: (fromPath: string, toPath: string) => void;
  /** 更新当前内容（编辑器变更时调用） */
  setContent: (content: string) => void;
  /** 保存当前文件到磁盘 */
  saveCurrent: () => Promise<void>;
  /** 设置当前光标所在标题 slug（编辑器选区变化时调用） */
  setCurrentHeadingSlug: (slug: string | null) => void;
  /** 保存活跃 tab 的编辑位置（光标 pos + 滚动 offset），切换/关闭前调用 */
  saveCursorState: (pos: number, scrollTop: number) => void;
  /** 读取活跃 tab 的编辑位置（用于编辑器 ready 后恢复） */
  getActiveCursorState: () => { pos: number | null; scrollTop: number | null };
  /** 刷新文件树（文件操作后调用） */
  refreshTree: () => Promise<void>;
  /** 文件被重命名时同步 tab 状态 */
  onFileRenamed: (from: string, to: string) => void;
  /** 文件被删除时同步 tab 状态 */
  onFileDeleted: (path: string) => void;
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
  recentFiles: loadRecentFiles(),

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
      // 已打开的文件被再次打开，也更新最近列表
      const next = pushRecent(get().recentFiles, filePath);
      set({ recentFiles: next });
      persistRecentFiles(next);
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
        cursorPos: null,
        scrollTop: null,
      };
      const nextRecent = pushRecent(get().recentFiles, filePath);
      set({
        openTabs: [...get().openTabs, tab],
        activeTabPath: filePath,
        currentFile: filePath,
        currentContent: content,
        dirty: false,
        saveError: null,
        lastSavedAt: null,
        currentHeadingSlug: null,
        recentFiles: nextRecent,
        loading: false,
      });
      persistRecentFiles(nextRecent);
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

  closeOthers: (keepPath) => {
    const { openTabs, activeTabPath } = get();
    const keep = openTabs.find((t) => t.path === keepPath);
    if (!keep) return;
    // 若活跃 tab 不在保留项中，激活保留项
    const nextActive = activeTabPath === keepPath ? keepPath : keepPath;
    set({
      openTabs: [keep],
      activeTabPath: nextActive,
      currentFile: keep.path,
      currentContent: keep.content,
      dirty: keep.dirty,
      lastSavedAt: keep.lastSavedAt,
      saveError: null,
      currentHeadingSlug: null,
    });
  },

  closeToRight: (fromPath) => {
    const { openTabs, activeTabPath } = get();
    const idx = openTabs.findIndex((t) => t.path === fromPath);
    if (idx === -1) return;
    const nextTabs = openTabs.slice(0, idx + 1);
    // 若活跃 tab 被关掉了，激活 fromPath
    const activeTab = nextTabs.find((t) => t.path === activeTabPath);
    if (activeTab) {
      set({ openTabs: nextTabs });
    } else {
      const fallback = openTabs[idx];
      set({
        openTabs: nextTabs,
        activeTabPath: fallback.path,
        currentFile: fallback.path,
        currentContent: fallback.content,
        dirty: fallback.dirty,
        lastSavedAt: fallback.lastSavedAt,
        saveError: null,
        currentHeadingSlug: null,
      });
    }
  },

  closeAll: () => {
    set({
      openTabs: [],
      activeTabPath: null,
      currentFile: null,
      currentContent: "",
      dirty: false,
      lastSavedAt: null,
      saveError: null,
      currentHeadingSlug: null,
    });
  },

  reorderTabs: (fromPath, toPath) => {
    if (fromPath === toPath) return;
    const { openTabs } = get();
    const fromIdx = openTabs.findIndex((t) => t.path === fromPath);
    const toIdx = openTabs.findIndex((t) => t.path === toPath);
    if (fromIdx === -1 || toIdx === -1) return;
    const next = [...openTabs];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    set({ openTabs: next });
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

  saveCursorState: (pos, scrollTop) => {
    const { activeTabPath, openTabs } = get();
    if (!activeTabPath) return;
    const tab = openTabs.find((t) => t.path === activeTabPath);
    if (!tab) return;
    // 与已存值相同则不更新，避免无意义渲染
    if (tab.cursorPos === pos && tab.scrollTop === scrollTop) return;
    const nextTabs = openTabs.map((t) =>
      t.path === activeTabPath ? { ...t, cursorPos: pos, scrollTop } : t,
    );
    set({ openTabs: nextTabs });
  },

  getActiveCursorState: () => {
    const { activeTabPath, openTabs } = get();
    if (!activeTabPath) return { pos: null, scrollTop: null };
    const tab = openTabs.find((t) => t.path === activeTabPath);
    if (!tab) return { pos: null, scrollTop: null };
    return { pos: tab.cursorPos, scrollTop: tab.scrollTop };
  },

  refreshTree: async () => {
    const { rootPath } = get();
    if (!rootPath) return;
    try {
      const tree = await listDir(rootPath);
      set({ tree });
    } catch {
      // 刷新失败忽略，不阻塞用户操作
    }
  },

  onFileRenamed: (from, to) => {
    const { openTabs, activeTabPath } = get();
    const nextTabs = openTabs.map((t) =>
      t.path === from ? { ...t, path: to } : t,
    );
    const patch: Partial<WorkspaceState> = { openTabs: nextTabs };
    if (activeTabPath === from) {
      patch.activeTabPath = to;
      patch.currentFile = to;
    }
    set(patch);
    // 同步 recentFiles
    const rf = get().recentFiles.map((p) => (p === from ? to : p));
    set({ recentFiles: rf });
    persistRecentFiles(rf);
    void get().refreshTree();
  },

  onFileDeleted: (path) => {
    const { openTabs } = get();
    const affected = openTabs.find((t) => t.path === path);
    if (affected) {
      get().closeTab(path);
    }
    // 同步 recentFiles
    const rf = get().recentFiles.filter((p) => p !== path);
    set({ recentFiles: rf });
    persistRecentFiles(rf);
    void get().refreshTree();
  },
}));
