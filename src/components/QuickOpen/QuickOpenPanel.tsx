// Quick Open 面板（#228）
//
// 键盘优先的文件快速打开：Ctrl/Cmd+P 打开 → 输入实时过滤 → ↑/↓ 选择 → Enter 打开 → Esc 关闭。
// 候选集与排序分别来自 workspaceIndex（索引缓存）与 quickOpenScore（纯函数），
// 本组件只负责「取数 → 渲染 → 键盘交互 → 打开文件」。
//
// a11y 采用 WAI-ARIA combobox 模式：焦点**始终留在输入框**，用 aria-activedescendant
// 指向高亮项。因此没有复用 useMenuA11y —— 那个 hook 是把 DOM 焦点移到 [role="menuitem"]
// 上，会把焦点从输入框夺走，导致连续输入被打断（Quick Open 的核心交互）。

import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "../../store/workspace";
import { relativeToRoot } from "../../lib/path";
import {
  loadCandidates,
  type CandidateSource,
} from "../../lib/workspaceIndex";
import {
  rankQuickOpenFiles,
  type QuickOpenCandidate,
} from "../../lib/quickOpenScore";
import { IconFileText, IconX } from "../icons";
import "./QuickOpenPanel.css";

/** 渲染上限：排序后截断，避免数千行 DOM（#228 §结果上限） */
export const MAX_RENDERED_RESULTS = 200;

const LIST_ID = "quick-open-list";

function optionId(index: number): string {
  return `quick-open-option-${index}`;
}

interface QuickOpenPanelProps {
  onClose: () => void;
}

export function QuickOpenPanel({ onClose }: QuickOpenPanelProps) {
  const rootPath = useWorkspace((s) => s.rootPath);
  const workspaceMode = useWorkspace((s) => s.workspaceMode);
  const openTabs = useWorkspace((s) => s.openTabs);
  const recentFiles = useWorkspace((s) => s.recentFiles);
  const openFile = useWorkspace((s) => s.openFile);

  const [query, setQuery] = useState("");
  const [paths, setPaths] = useState<string[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  /** 递增即重试：作为取数 effect 的依赖，避免额外的手动重建分支 */
  const [retryToken, setRetryToken] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 打开时自动聚焦输入框（键盘优先：打开即可直接输入）
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 取候选集：懒构建由索引层负责，这里只消费快照
  useEffect(() => {
    let cancelled = false;
    const source: CandidateSource = {
      rootPath,
      workspaceMode,
      tabPaths: openTabs.map((tab) => tab.path),
      recentFiles,
    };
    setLoading(true);
    setError(null);

    loadCandidates(source)
      .then((snapshot) => {
        if (cancelled) return;
        setPaths(snapshot.files);
        setTruncated(snapshot.truncated);
        setLoading(false);
        if (!snapshot.refresh) return;
        // 过期缓存已先行渲染，后台重建完成后无缝替换；
        // 重建失败保持旧结果（不把已在展示的列表变成错误态）
        void snapshot.refresh
          .then((fresh) => {
            if (cancelled) return;
            setPaths(fresh.files);
            setTruncated(fresh.truncated);
          })
          .catch(() => {});
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setPaths([]);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [rootPath, workspaceMode, openTabs, recentFiles, retryToken]);

  // 打分排序（纯函数，见 quickOpenScore）
  const ranked = useMemo(() => {
    const openPaths = new Set(openTabs.map((tab) => tab.path));
    const candidates: QuickOpenCandidate[] = paths.map((path) => ({
      path,
      relPath: relativeToRoot(path, rootPath),
      isOpen: openPaths.has(path),
      recentIndex: recentFiles.indexOf(path),
    }));
    return rankQuickOpenFiles(candidates, query);
  }, [paths, query, rootPath, openTabs, recentFiles]);

  const visible = useMemo(
    () => ranked.slice(0, MAX_RENDERED_RESULTS),
    [ranked],
  );

  // 输入或候选集变化后回到首项，避免高亮停在一个已不存在的位置
  useEffect(() => {
    setActiveIndex(0);
  }, [query, paths]);

  // 高亮项跟随滚动（只滚最近距离，不打断用户手动滚动）
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-option-index="${activeIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const openAndClose = async (path: string) => {
    try {
      await openFile(path);
    } catch {
      // 打开失败（文件已被删除 / 无权限）：保持面板打开，用户可另选一项。
      // 错误已由 workspace store 按路径记录，不在此重复提示。
      return;
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(visible.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = visible[activeIndex];
      if (target) void openAndClose(target.path);
    }
  };

  const showList = !loading && !error && visible.length > 0;
  const hiddenByLimit = ranked.length - visible.length;

  return (
    <div className="qo-backdrop" onClick={onClose}>
      <div
        className="qo-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="快速打开文件"
      >
        <div className="qo-header">
          <input
            ref={inputRef}
            className="qo-input"
            type="text"
            role="combobox"
            aria-expanded={showList}
            aria-controls={LIST_ID}
            aria-autocomplete="list"
            aria-activedescendant={
              showList ? optionId(activeIndex) : undefined
            }
            placeholder="输入文件名或路径片段…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className="qo-close" onClick={onClose} title="关闭 (Esc)">
            <IconX size={15} />
          </button>
        </div>

        <div className="qo-status">
          {loading && <span>正在索引工作区…</span>}
          {!loading && error && (
            <>
              <span className="qo-error">{error}</span>
              <button
                className="qo-retry"
                onClick={() => setRetryToken((t) => t + 1)}
              >
                重试
              </button>
            </>
          )}
          {!loading && !error && ranked.length > 0 && (
            <span>
              {`${ranked.length} 个候选`}
              {truncated && "（索引已达上限，仅覆盖部分文件）"}
            </span>
          )}
        </div>

        {showList && (
          <div
            className="qo-results"
            role="listbox"
            id={LIST_ID}
            aria-label="候选文件"
            ref={listRef}
          >
            {visible.map((item, index) => (
              <div
                key={item.path}
                id={optionId(index)}
                data-option-index={index}
                role="option"
                aria-selected={index === activeIndex}
                className={`qo-item${index === activeIndex ? " qo-item-active" : ""}`}
                title={item.path}
                onClick={() => void openAndClose(item.path)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span className="qo-item-icon">
                  <IconFileText size={14} />
                </span>
                <span className="qo-item-name">{item.basename}</span>
                <span className="qo-item-dir">
                  {item.relPath === item.basename
                    ? ""
                    : item.relPath.slice(0, item.relPath.length - item.basename.length - 1)}
                </span>
              </div>
            ))}
          </div>
        )}

        {!loading && !error && visible.length === 0 && (
          <div className="qo-empty">
            {query.trim() ? "无匹配结果" : "没有可打开的文件"}
          </div>
        )}

        <div className="qo-footer">
          <span>↑↓ 选择 · Enter 打开 · Esc 关闭</span>
          {hiddenByLimit > 0 && (
            <span className="qo-limit">
              仅显示前 {MAX_RENDERED_RESULTS} 条，继续输入以缩小范围
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default QuickOpenPanel;
