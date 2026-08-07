// 全局搜索面板
// 在工作区所有 .md 文件中搜索文本内容，列出命中文件 + 行号 + 预览。
// 点击命中项跳转到对应文件对应行。
// 快捷键 Ctrl/Cmd+Shift+F 打开，Esc 关闭。

import { useState, useRef, useEffect, useMemo } from "react";
import type { Editor } from "@milkdown/kit/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { TextSelection } from "@milkdown/kit/prose/state";
import { useWorkspace } from "../../store/workspace";
import { searchInWorkspace, type SearchHit } from "../../lib/fs";
import { IconFileText, IconX } from "../icons";
import "./GlobalSearchPanel.css";

interface GlobalSearchPanelProps {
  getEditor: () => Editor | undefined;
  onClose: () => void;
}

/** 取文件名 */
function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

/** 取相对工作区的路径 */
function relPath(p: string, root: string | null): string {
  if (!root) return basename(p);
  const rootNorm = root.replace(/\\/g, "/");
  const pNorm = p.replace(/\\/g, "/");
  if (pNorm.startsWith(rootNorm + "/")) {
    return pNorm.slice(rootNorm.length + 1);
  }
  return basename(p);
}

/** 按文件分组命中结果 */
interface GroupedResult {
  path: string;
  hits: SearchHit[];
}

/** 高亮预览文本中的匹配词 */
function highlightPreview(preview: string, query: string, useRegex: boolean, caseSensitive: boolean): React.ReactNode {
  if (!query) return preview;
  let pattern: string;
  try {
    pattern = useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(pattern, caseSensitive ? "g" : "gi");
    const parts: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(preview)) !== null) {
      if (m.index > last) parts.push(preview.slice(last, m.index));
      parts.push(
        <mark key={m.index} className="gs-highlight">
          {m[0]}
        </mark>,
      );
      last = m.index + m[0].length;
      if (m[0].length === 0) re.lastIndex++;
    }
    if (last < preview.length) parts.push(preview.slice(last));
    return parts;
  } catch {
    return preview;
  }
}

export function GlobalSearchPanel({ getEditor, onClose }: GlobalSearchPanelProps) {
  const rootPath = useWorkspace((s) => s.rootPath);
  const openFile = useWorkspace((s) => s.openFile);
  const [query, setQuery] = useState("");
  const [replaceText] = useState("");
  void replaceText;
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);

  // 打开时自动聚焦
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

  // 防抖搜索
  useEffect(() => {
    if (!query.trim()) {
      setHits([]);
      setError(null);
      setActiveIndex(0);
      return;
    }
    if (!rootPath) {
      setError("未打开工作区");
      return;
    }
    setSearching(true);
    setError(null);
    const timer = setTimeout(() => {
      searchInWorkspace(rootPath, query, caseSensitive, useRegex)
        .then((result) => {
          setHits(result);
          setActiveIndex(0);
          setSearching(false);
        })
        .catch((e) => {
          setError(e instanceof Error ? e.message : String(e));
          setSearching(false);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [query, caseSensitive, useRegex, rootPath]);

  // 按文件分组
  const grouped = useMemo<GroupedResult[]>(() => {
    const map = new Map<string, SearchHit[]>();
    for (const h of hits) {
      const arr = map.get(h.path) ?? [];
      arr.push(h);
      map.set(h.path, arr);
    }
    return Array.from(map.entries()).map(([path, hs]) => ({ path, hits: hs }));
  }, [hits]);

  const totalHits = hits.length;

  /** 跳转到命中位置 */
  const jumpTo = async (hit: SearchHit) => {
    try {
      await openFile(hit.path);
    } catch {
      // 错误已由 workspace store 按路径记录，留在当前搜索结果即可重试
      return;
    }
    // 文件读取期间若用户选择了其他文件，旧结果不得在新编辑器中移动光标
    if (useWorkspace.getState().currentFile !== hit.path) return;
    // 等编辑器更新后定位光标
    setTimeout(() => {
      if (useWorkspace.getState().currentFile !== hit.path) return;
      const editor = getEditor();
      if (!editor) return;
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const doc = view.state.doc;
        // 通过行号定位：累计行长度找到该行起始位置
        let pos = 0;
        let line = 1;
        doc.descendants((node) => {
          if (line >= hit.line) return false;
          if (node.isText) {
            const text = node.text ?? "";
            const newlines = (text.match(/\n/g) ?? []).length;
            for (let i = 0; i < newlines; i++) {
              line++;
              if (line === hit.line) {
                // 该换行后位置
                pos += text.indexOf("\n", text.indexOf("\n") > -1 ? pos : 0);
              }
            }
          }
          return true;
        });
        // 简化：用 TextSelection.near 定位到文档近似位置
        try {
          const safePos = Math.max(0, Math.min(pos, doc.content.size));
          const sel = TextSelection.near(doc.resolve(safePos));
          view.dispatch(view.state.tr.setSelection(sel).scrollIntoView());
          view.focus();
        } catch {
          // 忽略定位失败
        }
      });
    }, 200);
  };

  // 键盘上下导航
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(hits.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[activeIndex];
      if (hit) void jumpTo(hit);
    }
  };

  return (
    <div className="gs-backdrop" onClick={onClose}>
      <div className="gs-modal" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="gs-header">
          <input
            ref={inputRef}
            className="gs-input"
            placeholder="在工作区搜索…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="gs-toggles">
            <label className="gs-toggle" title="区分大小写">
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)}
              />
              <span>Aa</span>
            </label>
            <label className="gs-toggle" title="正则表达式">
              <input
                type="checkbox"
                checked={useRegex}
                onChange={(e) => setUseRegex(e.target.checked)}
              />
              <span>.*</span>
            </label>
          </div>
          <button className="gs-close" onClick={onClose} title="关闭 (Esc)">
            <IconX size={15} />
          </button>
        </div>
        <div className="gs-status">
          {searching && <span>搜索中…</span>}
          {!searching && error && <span className="gs-error">{error}</span>}
          {!searching && !error && query.trim() && (
            <span>
              {totalHits > 0
                ? `${grouped.length} 个文件，${totalHits} 处匹配`
                : "无匹配结果"}
            </span>
          )}
        </div>
        <div className="gs-results">
          {grouped.map((group) => (
            <div key={group.path} className="gs-group">
              <div className="gs-group-header" title={group.path}>
                <span className="gs-file-icon">
                  <IconFileText size={14} />
                </span>
                <span className="gs-file-name">{relPath(group.path, rootPath)}</span>
                <span className="gs-count">{group.hits.length}</span>
              </div>
              {group.hits.map((hit) => {
                const idx = hits.indexOf(hit);
                const active = idx === activeIndex;
                return (
                  <button
                    key={`${hit.path}:${hit.line}:${hit.column}`}
                    className={`gs-hit${active ? " gs-hit-active" : ""}`}
                    onClick={() => void jumpTo(hit)}
                    onMouseEnter={() => setActiveIndex(idx)}
                  >
                    <span className="gs-line">行 {hit.line}</span>
                    <span className="gs-preview">
                      {highlightPreview(hit.preview, query, useRegex, caseSensitive)}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          {!searching && !error && query.trim() && totalHits === 0 && (
            <div className="gs-empty">未找到匹配内容</div>
          )}
          {!query.trim() && (
            <div className="gs-empty">输入关键词开始搜索</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default GlobalSearchPanel;
