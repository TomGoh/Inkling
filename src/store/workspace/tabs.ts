// workspace slice：标签页 / 活跃文档镜像 / 分屏
// openTabs 是唯一数据源；currentFile / currentContent / dirty 等始终是「活跃 tab」
// 的镜像，切换 tab 时同步更新，保持下游组件接口不变。
// 文件读取（openingFiles / fileOpenErrors）与保存（saving / saveError）也在此维护。

import type { StateCreator } from "zustand";
import { isTauri } from "@tauri-apps/api/core";
import { readTextFile, writeTextFile } from "../../lib/fs";
import { flushAllMarkdownPublishers } from "../../components/Editor/markdown-publisher";
import {
  fileRequests,
  intents,
  parentDir,
  persistRecentFiles,
  pushRecent,
} from "./shared";
import type { OpenTab, WorkspaceState } from "./types";

/** 标签页 / 活跃文档 / 分屏 slice */
export interface TabsSlice {
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

  /** 正在读取的文件路径集合 */
  openingFiles: Set<string>;
  /** 文件读取错误（按路径记录，点击文件可重试） */
  fileOpenErrors: Map<string, string>;

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

  /** 打开文件：已打开则切换到对应 tab，否则读取内容新增 tab。不改变当前工作区模式 */
  openFile: (filePath: string) => Promise<void>;
  /**
   * 强制从磁盘重读文件内容并刷新对应 tab（外部修改后「重新加载」用）。
   * 与 openFile 的区别：openFile 对已打开的 tab 直接复用缓存内容，不会重读磁盘。
   * 未打开的文件退化为 openFile 行为。
   */
  reloadFile: (filePath: string) => Promise<void>;
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
  /** 更新指定 tab 的内容（异步发布必须绑定文件，避免 tab 切换后串写，PR #34） */
  setContentFor: (path: string, content: string) => void;
  /** 更新指定分屏文件的内容（绑定文件，避免 swap/close 后串写，PR #34） */
  setSplitContentFor: (path: string, content: string) => void;
  /** 保存当前文件到磁盘 */
  saveCurrent: () => Promise<void>;
  /** 设置当前光标所在标题 slug（编辑器选区变化时调用） */
  setCurrentHeadingSlug: (slug: string | null) => void;
  /** 保存指定 tab 的编辑位置（光标 pos + 滚动 offset）。绑定文件路径，
   *  避免切 tab 后旧编辑器销毁期 flush 串写到新 active tab（issue #30） */
  saveCursorState: (path: string, pos: number, scrollTop: number) => void;
  /** 读取指定 tab 的编辑位置（用于编辑器 ready 后恢复） */
  getCursorStateFor: (path: string) => { pos: number | null; scrollTop: number | null };
  /** 设置指定 tab 的基线磁盘内容（用于解决外部冲突后同步基线） */
  setTabDiskContent: (path: string, diskContent: string) => void;
  /** 设置指定 tab 的源码模式开关；path 省略则作用于当前 activeTabPath */
  setTabSourceMode: (enabled: boolean, path?: string) => void;
  /** 读取指定 tab 是否源码模式；path 省略则读 activeTabPath */
  getTabSourceMode: (path?: string) => boolean;
  /** 切换指定 tab 源码模式 */
  toggleTabSourceMode: (path?: string) => void;
}

export const createTabsSlice: StateCreator<WorkspaceState, [], [], TabsSlice> = (
  set,
  get,
) => {
  /** 读取文件并维护逐文件加载状态；同一路径的并发调用共享同一请求 */
  const readFileOnce = (filePath: string): Promise<string> => {
    const existing = fileRequests.get(filePath);
    if (existing) return existing;

    set((current) => {
      const openingFiles = new Set(current.openingFiles);
      const fileOpenErrors = new Map(current.fileOpenErrors);
      openingFiles.add(filePath);
      fileOpenErrors.delete(filePath);
      return { openingFiles, fileOpenErrors };
    });

    let request: Promise<string>;
    request = Promise.resolve()
      .then(() => readTextFile(filePath))
      .catch((error) => {
        if (fileRequests.get(filePath) === request) {
          set((current) => {
            const fileOpenErrors = new Map(current.fileOpenErrors);
            fileOpenErrors.set(
              filePath,
              error instanceof Error ? error.message : String(error),
            );
            return { fileOpenErrors };
          });
        }
        throw error;
      })
      .finally(() => {
        if (fileRequests.get(filePath) !== request) return;
        fileRequests.delete(filePath);
        set((current) => {
          if (!current.openingFiles.has(filePath)) return {};
          const openingFiles = new Set(current.openingFiles);
          openingFiles.delete(filePath);
          return { openingFiles };
        });
      });
    fileRequests.set(filePath, request);
    return request;
  };

  /** 确保文件已加入标签页，但不改变主面板或分屏的活跃文件 */
  const ensureTab = async (filePath: string): Promise<OpenTab> => {
    const existing = get().openTabs.find((tab) => tab.path === filePath);
    if (existing) return existing;

    const content = await readFileOnce(filePath);
    let resolvedTab: OpenTab | undefined;
    set((current) => {
      const currentTab = current.openTabs.find((tab) => tab.path === filePath);
      if (currentTab) {
        resolvedTab = currentTab;
        return {};
      }

      resolvedTab = {
        path: filePath,
        content,
        dirty: false,
        lastSavedAt: null,
        diskContent: content,
        cursorPos: null,
        scrollTop: null,
      };
      return { openTabs: [...current.openTabs, resolvedTab] };
    });
    return resolvedTab!;
  };

  /** 构造主面板激活状态；目标已在分屏时同步关闭分屏，避免重复展示 */
  const mainTabPatch = (
    current: WorkspaceState,
    tab: OpenTab,
  ): Partial<WorkspaceState> => {
    const closesSplit = current.splitFile === tab.path;
    if (closesSplit) intents.splitFile += 1;
    return {
      activeTabPath: tab.path,
      currentFile: tab.path,
      currentContent: tab.content,
      dirty: tab.dirty,
      saveError: null,
      lastSavedAt: tab.lastSavedAt,
      currentHeadingSlug: null,
      ...(closesSplit ? { splitFile: null, splitContent: "" } : {}),
    };
  };

  /** 按操作序号激活主面板；过期请求只保留为后台标签页 */
  const activateMainTab = (filePath: string, intent: number): void => {
    let nextRecent: string[] | null = null;
    set((current) => {
      if (intent !== intents.mainFile) return {};
      const tab = current.openTabs.find((candidate) => candidate.path === filePath);
      if (!tab) return {};

      nextRecent = pushRecent(current.recentFiles, filePath);
      const fileOpenErrors = new Map(current.fileOpenErrors);
      fileOpenErrors.delete(filePath);
      return {
        ...mainTabPatch(current, tab),
        recentFiles: nextRecent,
        fileOpenErrors,
      };
    });
    if (nextRecent) persistRecentFiles(nextRecent);
  };

  return {
    openTabs: [],
    activeTabPath: null,
    currentFile: null,
    currentContent: "",
    dirty: false,
    saving: false,
    saveError: null,
    lastSavedAt: null,
    currentHeadingSlug: null,
    openingFiles: new Set(),
    fileOpenErrors: new Map(),

    // 分屏状态
    splitFile: null,
    splitContent: "",

    openFile: async (filePath) => {
      const intent = ++intents.mainFile;
      await ensureTab(filePath);
      activateMainTab(filePath, intent);
    },

    reloadFile: async (filePath) => {
      // 未打开的文件退化为普通打开
      if (!get().openTabs.some((t) => t.path === filePath)) {
        await get().openFile(filePath);
        return;
      }
      try {
        // 直接读磁盘，绕过 tab 缓存（openFile 对已打开 tab 复用缓存，无法真正重载）
        const content = await readTextFile(filePath);
        set((current) => {
          const openTabs = current.openTabs.map((t) =>
            t.path === filePath
              ? {
                  ...t,
                  content,
                  dirty: false,
                  diskContent: content,
                  revision: (t.revision || 0) + 1,
                }
              : t,
          );
          const patch: Partial<WorkspaceState> = { openTabs };
          if (current.activeTabPath === filePath) {
            patch.currentContent = content;
            patch.dirty = false;
            patch.saveError = null;
          }
          if (current.splitFile === filePath) {
            patch.splitContent = content;
          }
          return patch;
        });
      } catch (err) {
        console.warn(`reloadFile 读取失败: ${filePath}`, err);
        set({ saveError: `文件重载失败（可能已被删除）：${err instanceof Error ? err.message : String(err)}` });
      }
    },

    openFileStandalone: async (filePath) => {
      const ownsWorkspaceContext = get().workspaceMode !== "folder";
      const contextIntent = ownsWorkspaceContext ? ++intents.workspaceContext : null;
      if (ownsWorkspaceContext) {
        // 单文件入口晚于尚未完成的文件夹打开时，以最新的用户操作为准
        intents.workspaceGeneration += 1;
        set({ workspaceLoading: false, loadingDirs: new Set() });
      }
      // 先用 openFile 完成 tab 读取/切换/recent 更新
      await get().openFile(filePath);
      // 单文件模式：不构建文件树，但保留父目录作为当前文件上下文。
      // 仅当当前不是 folder 模式时才设为 file 模式，避免覆盖已打开的文件夹工作区。
      const { workspaceMode, activeTabPath } = get();
      if (
        !ownsWorkspaceContext ||
        contextIntent !== intents.workspaceContext ||
        workspaceMode === "folder" ||
        activeTabPath !== filePath
      ) {
        return;
      }
      const parent = parentDir(filePath);
      set({ rootPath: parent, workspaceMode: "file", tree: null });
    },

    newTab: () => {
      flushAllMarkdownPublishers();
      intents.mainFile += 1;
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
      const intent = ++intents.splitFile;
      const tab = await ensureTab(filePath);
      if (intent !== intents.splitFile) return;
      // 不让分屏文件与主文件相同（无对照意义）
      if (filePath === get().currentFile) return;
      set({ splitFile: filePath, splitContent: tab.content });
    },

    splitClose: () => {
      intents.splitFile += 1;
      set({ splitFile: null, splitContent: "" });
    },

    splitSwap: () => {
      flushAllMarkdownPublishers();
      const { splitFile, currentFile, openTabs } = get();
      if (!splitFile || !currentFile) return;
      const mainTab = openTabs.find((t) => t.path === currentFile);
      const splitTab = openTabs.find((t) => t.path === splitFile);
      if (!mainTab || !splitTab) return;
      // 主面板切换到原分屏文件，分屏切换到原主文件
      get().switchTab(splitFile);
      const latestMainTab = get().openTabs.find((t) => t.path === currentFile);
      set({ splitFile: currentFile, splitContent: latestMainTab?.content ?? mainTab.content });
    },

    switchTab: (filePath) => {
      flushAllMarkdownPublishers();
      const tab = get().openTabs.find((t) => t.path === filePath);
      if (!tab) return;
      intents.mainFile += 1;
      // 切换 tab 时重置大纲高亮，等编辑器更新后由 tracker 重新计算
      set((current) => mainTabPatch(current, tab));
    },

    closeTab: (filePath) => {
      flushAllMarkdownPublishers();
      const { openTabs, activeTabPath } = get();
      const idx = openTabs.findIndex((t) => t.path === filePath);
      if (idx === -1) return;
      const nextTabs = openTabs.filter((t) => t.path !== filePath);
      // 若关闭的是分屏文件，同步关闭分屏面板
      const splitClosing = get().splitFile === filePath;
      if (activeTabPath === filePath) intents.mainFile += 1;
      if (splitClosing) intents.splitFile += 1;

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
          set((current) => ({
            openTabs: nextTabs,
            ...mainTabPatch(current, next),
          }));
        }
      } else {
        // 关闭的不是活跃 tab，只更新列表
        set({ openTabs: nextTabs });
      }
      // 若关闭的是分屏文件，同步关闭分屏面板
      if (splitClosing) set({ splitFile: null, splitContent: "" });
    },

    closeOthers: (keepPath) => {
      flushAllMarkdownPublishers();
      const { openTabs, splitFile } = get();
      const keep = openTabs.find((t) => t.path === keepPath);
      if (!keep) return;
      intents.mainFile += 1;
      if (splitFile && splitFile !== keepPath) intents.splitFile += 1;
      set((current) => ({
        openTabs: [keep],
        ...mainTabPatch(current, keep),
        splitFile: null,
        splitContent: "",
      }));
    },

    closeToRight: (fromPath) => {
      flushAllMarkdownPublishers();
      const { openTabs, activeTabPath, splitFile } = get();
      const idx = openTabs.findIndex((t) => t.path === fromPath);
      if (idx === -1) return;
      intents.mainFile += 1;
      const nextTabs = openTabs.slice(0, idx + 1);
      const splitRemoved = !!splitFile && !nextTabs.some((tab) => tab.path === splitFile);
      if (splitRemoved) intents.splitFile += 1;
      // 若活跃 tab 被关掉了，激活 fromPath
      const activeTab = nextTabs.find((t) => t.path === activeTabPath);
      if (activeTab) {
        set({
          openTabs: nextTabs,
          ...(splitRemoved ? { splitFile: null, splitContent: "" } : {}),
        });
      } else {
        const fallback = openTabs[idx];
        set((current) => ({
          openTabs: nextTabs,
          ...mainTabPatch(current, fallback),
          ...(splitRemoved ? { splitFile: null, splitContent: "" } : {}),
        }));
      }
    },

    closeAll: () => {
      flushAllMarkdownPublishers();
      intents.mainFile += 1;
      intents.splitFile += 1;
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

    setContentFor: (path, content) => {
      const { activeTabPath, openTabs } = get();
      const tab = openTabs.find((t) => t.path === path);
      if (!tab || tab.content === content) return;
      const nextTabs = openTabs.map((t) =>
        t.path === path ? { ...t, content, dirty: true } : t,
      );
      // 同步所有当前拥有该 path 的镜像：活跃 tab 用 currentContent、
      // 分屏用 splitContent。swap 后的迟到 flush 可能指向新主/新分屏文件，
      // 只写 openTabs 会让另一侧编辑器拿到旧值并在下次编辑时覆盖（PR #34）
      const patch: Partial<WorkspaceState> = { openTabs: nextTabs };
      if (path === activeTabPath) {
        patch.currentContent = content;
        patch.dirty = true;
      }
      const { splitFile, splitContent } = get();
      if (path === splitFile && content !== splitContent) {
        patch.splitContent = content;
      }
      set(patch);
    },

    setSplitContentFor: (path, content) => {
      get().setContentFor(path, content);
    },

    saveCurrent: async () => {
      flushAllMarkdownPublishers();
      const { dirty, saving, activeTabPath, openTabs } = get();
      if (!activeTabPath) return;
      const tab = openTabs.find((t) => t.path === activeTabPath);
      if (!tab) return;
      if (!dirty || saving) return;

      // 立即置位 saving，防止重入（例如弹窗期间定时保存触发）
      set({ saving: true, saveError: null });

      let savePath = tab.path;
      // 记录本次保存发起时快照内容
      const contentToSave = tab.content;

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
          if (!picked) {
            set({ saving: false });
            return; // 用户取消
          }
          savePath = picked;
        }
      } else if (isTauri()) {
        // 普通文件保存前与磁盘基线比对：外部已改动且未被冲突对话框处理过时二次确认，
        // 防止 Ctrl+S 静默覆盖外部修改（直接读磁盘，不触发 openingFiles 打开态副作用）
        try {
          const latestOnDisk = await readTextFile(savePath);
          if (tab.diskContent !== undefined && latestOnDisk !== tab.diskContent) {
            const { ask } = await import("@tauri-apps/plugin-dialog");
            const confirmed = await ask(
              "文件已被外部程序修改。覆盖保存将丢失外部修改，是否继续覆盖？",
              { title: "保存冲突提示", kind: "warning" },
            );
            if (!confirmed) {
              set({ saving: false });
              return;
            }
          }
        } catch {
          // 文件可能被删除或不可读，继续尝试保存
        }
      }

      try {
        await writeTextFile(savePath, contentToSave);
        const now = Date.now();
        // 异步窗口结束后重新获取最新 store 状态，避免覆盖窗口期间其他 tab / 分屏并发发布的编辑内容
        const latestState = get();
        const nextTabs = latestState.openTabs.map((t) => {
          if (t.path === activeTabPath) {
            // 如果写盘期间内容又发生了新的修改，保持 dirty 为 true
            const isStillDirty = t.content !== contentToSave;
            return {
              ...t,
              path: savePath,
              isUntitled: false,
              dirty: isStillDirty,
              lastSavedAt: now,
              diskContent: contentToSave,
            };
          }
          return t;
        });
        const nextRecent = tab.isUntitled ? pushRecent(latestState.recentFiles, savePath) : latestState.recentFiles;
        if (tab.isUntitled) persistRecentFiles(nextRecent);

        const currentActiveTab = nextTabs.find((t) => t.path === (latestState.activeTabPath === activeTabPath ? savePath : latestState.activeTabPath));
        set({
          openTabs: nextTabs,
          activeTabPath: latestState.activeTabPath === activeTabPath ? savePath : latestState.activeTabPath,
          currentFile: latestState.currentFile === activeTabPath ? savePath : latestState.currentFile,
          saving: false,
          dirty: currentActiveTab ? currentActiveTab.dirty : false,
          saveError: null,
          lastSavedAt: latestState.activeTabPath === activeTabPath ? now : latestState.lastSavedAt,
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

    saveCursorState: (path, pos, scrollTop) => {
      const { openTabs } = get();
      const tab = openTabs.find((t) => t.path === path);
      if (!tab) return;
      // 与已存值相同则不更新，避免无意义渲染
      if (tab.cursorPos === pos && tab.scrollTop === scrollTop) return;
      const nextTabs = openTabs.map((t) =>
        t.path === path ? { ...t, cursorPos: pos, scrollTop } : t,
      );
      set({ openTabs: nextTabs });
    },

    getCursorStateFor: (path) => {
      const tab = get().openTabs.find((t) => t.path === path);
      if (!tab) return { pos: null, scrollTop: null };
      return { pos: tab.cursorPos, scrollTop: tab.scrollTop };
    },

    setTabDiskContent: (path, diskContent) => {
      const nextTabs = get().openTabs.map((t) =>
        t.path === path ? { ...t, diskContent } : t,
      );
      set({ openTabs: nextTabs });
    },

    setTabSourceMode: (enabled, path) => {
      const target = path ?? get().activeTabPath;
      if (!target) return;
      const nextTabs = get().openTabs.map((t) =>
        t.path === target ? { ...t, sourceMode: enabled } : t,
      );
      set({ openTabs: nextTabs });
    },

    getTabSourceMode: (path) => {
      const target = path ?? get().activeTabPath;
      if (!target) return false;
      return get().openTabs.find((t) => t.path === target)?.sourceMode ?? false;
    },

    toggleTabSourceMode: (path) => {
      const target = path ?? get().activeTabPath;
      if (!target) return;
      const cur = get().getTabSourceMode(target);
      get().setTabSourceMode(!cur, target);
    },
  };
};
