// 工作区状态管理
// 当前打开的工作区（文件夹）、文件树、多标签页编辑
// currentFile / currentContent / dirty 等始终是「活跃 tab」的镜像，
// 切换 tab 时同步更新，保持下游组件接口不变。

import { create } from "zustand";
import { isTauri } from "@tauri-apps/api/core";
import { listDir, readTextFile, writeTextFile, type FileNode } from "../lib/fs";
import {
  collectDirectoryPaths,
  isPathWithin,
  mergeDirectoryListing,
} from "../lib/fileTree";

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

/** 展开目录列表的持久化 key（未记录的目录默认折叠） */
const EXPANDED_DIRS_KEY = "inkling-expanded-dirs-v2";

/** 读取持久化的展开目录列表 */
function loadExpandedDirs(): Set<string> {
  try {
    const raw = localStorage.getItem(EXPANDED_DIRS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

/** 持久化展开目录列表 */
function persistExpandedDirs(dirs: Set<string>): void {
  try {
    localStorage.setItem(EXPANDED_DIRS_KEY, JSON.stringify([...dirs]));
  } catch {
    // 忽略写入失败
  }
}

/** 工作区切换序号：较旧的异步结果不得覆盖后来打开的工作区 */
let workspaceGeneration = 0;

/** 同一目录的并发请求复用同一个 Promise，避免重复枚举 */
const directoryRequests = new Map<string, Promise<void>>();

/** 加载中的目录发生文件变更时，合并为一次后续强制刷新 */
const forcedDirectoryRequests = new Map<string, Promise<void>>();

/** 书签列表的持久化 key */
const BOOKMARKS_KEY = "inkling-bookmarks";

/** 读取持久化的书签列表 */
function loadBookmarks(): string[] {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as string[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** 持久化书签列表 */
function persistBookmarks(files: string[]): void {
  try {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(files));
  } catch {
    // 忽略写入失败
  }
}

/** 把 path 推到列表头部并去重，截断到最大长度 */
function pushRecent(list: string[], path: string): string[] {
  const next = [path, ...list.filter((p) => p !== path)];
  return next.slice(0, RECENT_FILES_MAX);
}

/** 取文件所在目录路径（兼容 / 与 \），根目录则返回原路径 */
function parentDir(filePath: string): string {
  const idx = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  if (idx < 0) return filePath;
  if (idx === 0) return filePath.slice(0, 1);
  if (idx === 2 && /^[a-zA-Z]:[\\/]/.test(filePath)) return filePath.slice(0, 3);
  return filePath.slice(0, idx);
}

/** 把目录重命名前缀同步到持久化路径 */
function rebasePathPrefix(path: string, from: string, to: string): string {
  return isPathWithin(path, from) ? to + path.slice(from.length) : path;
}

/** 单个打开的标签页 */
export interface OpenTab {
  /** 文件完整路径（未命名草稿用 untitled-N 虚拟路径） */
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
  /** 未命名草稿：尚未保存到磁盘的新建文件，保存时弹另存为对话框 */
  isUntitled?: boolean;
}

interface WorkspaceState {
  /** 工作区根路径（null 表示未打开） */
  rootPath: string | null;
  /**
   * 工作区模式：
   * - "folder"：打开了文件夹，tree 有效
   * - "file"：单文件模式，仅打开了散落的 md 文件，不构建文件树；rootPath 为当前文件父目录
   * - null：未打开任何东西
   */
  workspaceMode: "folder" | "file" | null;
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

  // 分屏：右侧第二面板，独立展示另一个已打开的 tab（只读对照为主）
  /** 分屏面板展示的文件路径（null 表示未分屏） */
  splitFile: string | null;
  /** 分屏面板展示的文件内容（从对应 tab 实时同步） */
  splitContent: string;
  /** 在分屏面板打开一个已存在的 tab 作为对照（若未打开则先 openFile） */
  splitOpen: (filePath: string) => Promise<void>;
  /** 关闭分屏面板 */
  splitClose: () => void;
  /** 在分屏面板与主面板之间交换文件（把当前主文件挪到分屏，分屏文件挪到主） */
  splitSwap: () => void;
  /** 更新分屏面板内容（分屏编辑时调用），同步到对应 tab */
  setSplitContent: (content: string) => void;

  /** 最近打开的文件路径列表（最多 10 个，最新在前） */
  recentFiles: string[];

  /** 展开的目录路径集合（持久化，未记录的目录默认折叠） */
  expandedDirs: Set<string>;
  /** 已完成单层枚举的目录路径集合 */
  loadedDirs: Set<string>;
  /** 正在枚举的目录路径集合 */
  loadingDirs: Set<string>;
  /** 目录枚举错误（按路径记录，点击错误行可重试） */
  directoryErrors: Map<string, string>;
  /** 切换目录展开状态并持久化 */
  toggleDirExpanded: (path: string) => void;
  /** 设置目录展开状态并持久化 */
  setDirExpanded: (path: string, expanded: boolean) => void;
  /** 查询目录是否展开（未记录时默认折叠） */
  isDirExpanded: (path: string) => boolean;
  /** 按需枚举一个目录的直接子项 */
  loadDirectory: (path: string, force?: boolean) => Promise<void>;

  /** 书签文件路径列表 */
  bookmarks: string[];
  /** 切换书签状态（已收藏则取消，未收藏则添加） */
  toggleBookmark: (path: string) => void;
  /** 查询是否已收藏 */
  isBookmarked: (path: string) => boolean;

  /** 打开工作区：只读取根目录的直接子项 */
  openWorkspace: (dirPath: string) => Promise<void>;
  /** 打开文件：已打开则切换到对应 tab，否则读取内容新增 tab。不改变当前工作区模式 */
  openFile: (filePath: string) => Promise<void>;
  /**
   * 以单文件模式打开一个 md：不构建文件树，但把 rootPath 设为该文件父目录，
   * workspaceMode 置为 "file"。
   * 用于"打开文件"入口——支持散落在不同文件夹的多个 md 作为标签页。
   */
  openFileStandalone: (filePath: string) => Promise<void>;
  /**
   * 新建未命名草稿标签页（Ctrl+N）。不关联磁盘文件，内容为空。
   * 首次 Ctrl+S 保存时弹另存为对话框选择保存位置，保存后转为普通文件 tab。
   */
  newTab: () => void;
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
  /** 刷新指定目录（省略路径时刷新工作区根目录） */
  refreshTree: (dirPath?: string) => Promise<void>;
  /** 文件被重命名时同步 tab 状态 */
  onFileRenamed: (from: string, to: string) => void;
  /** 文件被删除时同步 tab 状态 */
  onFileDeleted: (path: string) => void;
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  rootPath: null,
  workspaceMode: null,
  tree: null,
  loading: false,

  // 分屏状态
  splitFile: null,
  splitContent: "",
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
  expandedDirs: loadExpandedDirs(),
  loadedDirs: new Set(),
  loadingDirs: new Set(),
  directoryErrors: new Map(),
  bookmarks: loadBookmarks(),

  toggleDirExpanded: (path) => {
    const next = new Set(get().expandedDirs);
    if (!next.has(path)) next.add(path);
    else next.delete(path);
    set({ expandedDirs: next });
    persistExpandedDirs(next);
  },

  setDirExpanded: (path, expanded) => {
    const next = new Set(get().expandedDirs);
    if (expanded) next.add(path);
    else next.delete(path);
    set({ expandedDirs: next });
    persistExpandedDirs(next);
  },

  isDirExpanded: (path) => get().expandedDirs.has(path),

  loadDirectory: async (path, force = false) => {
    const state = get();
    if (
      !state.rootPath ||
      state.workspaceMode !== "folder" ||
      !isPathWithin(path, state.rootPath)
    ) {
      return;
    }
    if (!force && state.loadedDirs.has(path)) return;

    const generation = workspaceGeneration;
    const requestKey = `${generation}\0${path}`;
    const existing = directoryRequests.get(requestKey);
    if (existing) {
      if (!force) return existing;
      const queued = forcedDirectoryRequests.get(requestKey);
      if (queued) return queued;

      const refresh = existing
        .catch(() => {})
        .then(() => {
          // 后续扫描开始前释放标记，使扫描期间的新变更可继续排队
          forcedDirectoryRequests.delete(requestKey);
          if (generation !== workspaceGeneration) return;
          return get().loadDirectory(path, true);
        });
      forcedDirectoryRequests.set(requestKey, refresh);
      return refresh;
    }

    const request = (async () => {
      const loadingDirs = new Set(get().loadingDirs);
      const directoryErrors = new Map(get().directoryErrors);
      loadingDirs.add(path);
      directoryErrors.delete(path);
      set({ loadingDirs, directoryErrors });

      try {
        const listing = await listDir(path);
        if (generation !== workspaceGeneration) return;

        set((current) => {
          if (
            !current.tree ||
            current.rootPath !== state.rootPath ||
            current.workspaceMode !== "folder"
          ) {
            return {};
          }

          const tree = mergeDirectoryListing(current.tree, listing);
          if (tree === current.tree) return {};

          const existingDirs = collectDirectoryPaths(tree);
          const loadedDirs = new Set(
            [...current.loadedDirs].filter((dir) => existingDirs.has(dir)),
          );
          loadedDirs.add(path);
          const errors = new Map(
            [...current.directoryErrors].filter(([dir]) => existingDirs.has(dir)),
          );
          errors.delete(path);
          return { tree, loadedDirs, directoryErrors: errors };
        });
      } catch (e) {
        const current = get();
        if (
          generation === workspaceGeneration &&
          current.tree &&
          collectDirectoryPaths(current.tree).has(path)
        ) {
          const errors = new Map(current.directoryErrors);
          errors.set(path, e instanceof Error ? e.message : String(e));
          set({ directoryErrors: errors });
        }
        throw e;
      } finally {
        directoryRequests.delete(requestKey);
        if (generation === workspaceGeneration) {
          const next = new Set(get().loadingDirs);
          next.delete(path);
          set({ loadingDirs: next });
        }
      }
    })();

    directoryRequests.set(requestKey, request);
    return request;
  },

  toggleBookmark: (path) => {
    const next = get().bookmarks.includes(path)
      ? get().bookmarks.filter((p) => p !== path)
      : [...get().bookmarks, path];
    set({ bookmarks: next });
    persistBookmarks(next);
  },

  isBookmarked: (path) => get().bookmarks.includes(path),

  openWorkspace: async (dirPath) => {
    const generation = ++workspaceGeneration;
    const expandedDirs = new Set(get().expandedDirs);
    expandedDirs.add(dirPath);
    set({
      loading: true,
      loadingDirs: new Set([dirPath]),
    });
    try {
      const tree = await listDir(dirPath);
      if (generation !== workspaceGeneration) return;
      persistExpandedDirs(expandedDirs);
      set({
        rootPath: dirPath,
        workspaceMode: "folder",
        tree,
        loading: false,
        expandedDirs,
        loadedDirs: new Set([dirPath]),
        loadingDirs: new Set(),
        directoryErrors: new Map(),
      });
    } catch (e) {
      if (generation !== workspaceGeneration) return;
      set({ loading: false, loadingDirs: new Set() });
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

  openFileStandalone: async (filePath) => {
    // 先用 openFile 完成 tab 读取/切换/recent 更新
    await get().openFile(filePath);
    // 单文件模式：不构建文件树，但保留父目录作为当前文件上下文。
    // 仅当当前不是 folder 模式时才设为 file 模式，避免覆盖已打开的文件夹工作区。
    const { workspaceMode } = get();
    if (workspaceMode === "folder") return;
    const parent = parentDir(filePath);
    set({ rootPath: parent, workspaceMode: "file", tree: null });
  },

  newTab: () => {
    const { openTabs } = get();
    // 生成唯一虚拟路径 untitled-1, untitled-2...（避免与已打开草稿重名）
    let n = 1;
    const existing = new Set(openTabs.map((t) => t.path));
    while (existing.has(`untitled-${n}`)) n++;
    const path = `untitled-${n}`;
    const tab: OpenTab = {
      path,
      content: "",
      dirty: false,
      lastSavedAt: null,
      cursorPos: null,
      scrollTop: null,
      isUntitled: true,
    };
    set({
      openTabs: [...get().openTabs, tab],
      activeTabPath: path,
      currentFile: path,
      currentContent: "",
      dirty: false,
      saveError: null,
      lastSavedAt: null,
      currentHeadingSlug: null,
    });
  },

  splitOpen: async (filePath) => {
    // 确保该文件已在 openTabs 中（不在则先打开，但不要切换主面板活跃 tab）
    const existed = get().openTabs.find((t) => t.path === filePath);
    if (!existed) {
      // 先记录当前活跃 tab，openFile 会切换活跃，之后切回
      const prevActive = get().activeTabPath;
      await get().openFile(filePath);
      if (prevActive && prevActive !== filePath) get().switchTab(prevActive);
    }
    const tab = get().openTabs.find((t) => t.path === filePath);
    if (!tab) return;
    // 不让分屏文件与主文件相同（无对照意义）
    if (filePath === get().currentFile) return;
    set({ splitFile: filePath, splitContent: tab.content });
  },

  splitClose: () => set({ splitFile: null, splitContent: "" }),

  splitSwap: () => {
    const { splitFile, currentFile, openTabs } = get();
    if (!splitFile || !currentFile) return;
    const mainTab = openTabs.find((t) => t.path === currentFile);
    const splitTab = openTabs.find((t) => t.path === splitFile);
    if (!mainTab || !splitTab) return;
    // 主面板切换到原分屏文件，分屏切换到原主文件
    get().switchTab(splitFile);
    set({ splitFile: currentFile, splitContent: mainTab.content });
  },

  setSplitContent: (content) => {
    const { splitFile, splitContent, openTabs } = get();
    if (!splitFile || content === splitContent) return;
    const nextTabs = openTabs.map((t) =>
      t.path === splitFile ? { ...t, content, dirty: true } : t,
    );
    set({ openTabs: nextTabs, splitContent: content });
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
    // 若关闭的是分屏文件，同步关闭分屏面板
    const splitClosing = get().splitFile === filePath;

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
    // 若关闭的是分屏文件，同步关闭分屏面板
    if (splitClosing) set({ splitFile: null, splitContent: "" });
  },

  closeOthers: (keepPath) => {
    const { openTabs, activeTabPath, splitFile } = get();
    const keep = openTabs.find((t) => t.path === keepPath);
    if (!keep) return;
    // 若活跃 tab 不在保留项中，激活保留项
    const nextActive = activeTabPath === keepPath ? keepPath : keepPath;
    // 分屏文件若不在保留项，关闭分屏
    const splitStillValid = splitFile === keepPath;
    set({
      openTabs: [keep],
      activeTabPath: nextActive,
      currentFile: keep.path,
      currentContent: keep.content,
      dirty: keep.dirty,
      lastSavedAt: keep.lastSavedAt,
      saveError: null,
      currentHeadingSlug: null,
      splitFile: splitStillValid ? splitFile : null,
      splitContent: splitStillValid ? get().splitContent : "",
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
      splitFile: null,
      splitContent: "",
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
    const { currentContent, dirty, saving, activeTabPath, openTabs } = get();
    if (!activeTabPath) return;
    const tab = openTabs.find((t) => t.path === activeTabPath);
    if (!tab) return;
    if (!dirty || saving) return;

    let savePath = tab.path;
    // 未命名草稿：首次保存弹另存为对话框选择保存位置
    if (tab.isUntitled) {
      if (!isTauri()) {
        // 浏览器 mock 模式：直接用原虚拟路径写内存
        savePath = tab.path;
      } else {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const picked = await save({
          defaultPath: "未命名.md",
          filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
        });
        if (!picked) return; // 用户取消
        savePath = picked;
      }
    }

    set({ saving: true, saveError: null });
    try {
      await writeTextFile(savePath, currentContent);
      const now = Date.now();
      // 同步活跃 tab：未命名草稿保存后转为普通文件（path 更新为真实路径）
      const nextTabs = openTabs.map((t) =>
        t.path === activeTabPath
          ? { ...t, path: savePath, isUntitled: false, dirty: false, lastSavedAt: now }
          : t,
      );
      const nextRecent = tab.isUntitled ? pushRecent(get().recentFiles, savePath) : get().recentFiles;
      if (tab.isUntitled) persistRecentFiles(nextRecent);
      set({
        openTabs: nextTabs,
        activeTabPath: savePath,
        currentFile: savePath,
        saving: false,
        dirty: false,
        saveError: null,
        lastSavedAt: now,
        recentFiles: nextRecent,
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

  refreshTree: async (dirPath) => {
    const { rootPath, workspaceMode } = get();
    // 单文件模式不构建文件树，跳过刷新
    if (!rootPath || workspaceMode !== "folder") return;
    try {
      await get().loadDirectory(dirPath ?? rootPath, true);
    } catch {
      // 刷新失败忽略，不阻塞用户操作
    }
  },

  onFileRenamed: (from, to) => {
    const {
      openTabs,
      activeTabPath,
      splitFile,
      expandedDirs,
      loadedDirs,
      loadingDirs,
      directoryErrors,
    } = get();
    const nextTabs = openTabs.map((t) =>
      t.path === from ? { ...t, path: to } : t,
    );
    const patch: Partial<WorkspaceState> = { openTabs: nextTabs };
    if (activeTabPath === from) {
      patch.activeTabPath = to;
      patch.currentFile = to;
    }
    // 分屏文件被重命名，同步路径
    if (splitFile === from) patch.splitFile = to;
    set(patch);
    // 同步 recentFiles
    const rf = get().recentFiles.map((p) => (p === from ? to : p));
    set({ recentFiles: rf });
    persistRecentFiles(rf);
    // 同步 bookmarks（精确匹配文件，目录重命名时前缀匹配子项）
    const bk = get().bookmarks.map((p) =>
      p === from ? to : p.startsWith(from + "/") || p.startsWith(from + "\\")
        ? to + p.slice(from.length)
        : p,
    );
    // 目录重命名后保留展开偏好，但让新路径重新按需加载子项
    const nextExpanded = new Set(
      [...expandedDirs].map((path) => rebasePathPrefix(path, from, to)),
    );
    const nextLoaded = new Set([...loadedDirs].filter((path) => !isPathWithin(path, from)));
    const nextLoading = new Set(
      [...loadingDirs].filter((path) => !isPathWithin(path, from)),
    );
    const nextErrors = new Map(
      [...directoryErrors].filter(([path]) => !isPathWithin(path, from)),
    );
    set({
      bookmarks: bk,
      expandedDirs: nextExpanded,
      loadedDirs: nextLoaded,
      loadingDirs: nextLoading,
      directoryErrors: nextErrors,
    });
    persistBookmarks(bk);
    persistExpandedDirs(nextExpanded);
    void get().refreshTree(parentDir(from));
  },

  onFileDeleted: (path) => {
    const { openTabs, expandedDirs, loadedDirs, loadingDirs, directoryErrors } = get();
    const affected = openTabs.find((t) => t.path === path);
    if (affected) {
      get().closeTab(path);
    }
    // 同步 recentFiles
    const rf = get().recentFiles.filter((p) => p !== path);
    set({ recentFiles: rf });
    persistRecentFiles(rf);
    // 同步 bookmarks（移除被删除文件及其目录下的子项）
    const bk = get().bookmarks.filter(
      (p) => p !== path && !p.startsWith(path + "/") && !p.startsWith(path + "\\"),
    );
    const nextExpanded = new Set(
      [...expandedDirs].filter((dir) => !isPathWithin(dir, path)),
    );
    const nextLoaded = new Set([...loadedDirs].filter((dir) => !isPathWithin(dir, path)));
    const nextLoading = new Set(
      [...loadingDirs].filter((dir) => !isPathWithin(dir, path)),
    );
    const nextErrors = new Map(
      [...directoryErrors].filter(([dir]) => !isPathWithin(dir, path)),
    );
    set({
      bookmarks: bk,
      expandedDirs: nextExpanded,
      loadedDirs: nextLoaded,
      loadingDirs: nextLoading,
      directoryErrors: nextErrors,
    });
    persistBookmarks(bk);
    persistExpandedDirs(nextExpanded);
    void get().refreshTree(parentDir(path));
  },
}));
