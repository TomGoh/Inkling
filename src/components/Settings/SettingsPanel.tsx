// 偏好设置面板（模态）
// 集中展示可由用户开关的编辑器行为，直接读写 settings store，实时生效。
// 包含：专注模式、打字机模式、公式自动编号、代码块语法高亮主题。

import { useSettings, type CodeBlockTheme } from "../../store/settings";
import "./SettingsPanel.css";

const CODE_THEME_OPTIONS: { value: CodeBlockTheme; label: string }[] = [
  { value: "oneDark", label: "One Dark（深色）" },
  { value: "light", label: "浅色（彩色高亮）" },
  { value: "none", label: "无高亮" },
];

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const formulaAutoNumber = useSettings((s) => s.formulaAutoNumber);
  const codeBlockTheme = useSettings((s) => s.codeBlockTheme);
  const focusMode = useSettings((s) => s.focusMode);
  const typewriterMode = useSettings((s) => s.typewriterMode);
  const setFormulaAutoNumber = useSettings((s) => s.setFormulaAutoNumber);
  const setCodeBlockTheme = useSettings((s) => s.setCodeBlockTheme);
  const setFocusMode = useSettings((s) => s.setFocusMode);
  const setTypewriterMode = useSettings((s) => s.setTypewriterMode);
  const reset = useSettings((s) => s.reset);

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span className="settings-title">偏好设置</span>
          <button className="settings-close" onClick={onClose} title="关闭">
            ✕
          </button>
        </div>
        <div className="settings-body">
          <label className="settings-row">
            <div className="settings-label">
              <span className="settings-name">专注模式</span>
              <span className="settings-desc">弱化非当前段落，聚焦当前内容</span>
            </div>
            <input
              type="checkbox"
              className="settings-toggle"
              checked={focusMode}
              onChange={(e) => setFocusMode(e.target.checked)}
            />
          </label>

          <label className="settings-row">
            <div className="settings-label">
              <span className="settings-name">打字机模式</span>
              <span className="settings-desc">当前编辑行始终保持在视窗垂直居中</span>
            </div>
            <input
              type="checkbox"
              className="settings-toggle"
              checked={typewriterMode}
              onChange={(e) => setTypewriterMode(e.target.checked)}
            />
          </label>

          <label className="settings-row">
            <div className="settings-label">
              <span className="settings-name">公式自动编号</span>
              <span className="settings-desc">块级公式按文档顺序自动编号 (1)(2)…</span>
            </div>
            <input
              type="checkbox"
              className="settings-toggle"
              checked={formulaAutoNumber}
              onChange={(e) => setFormulaAutoNumber(e.target.checked)}
            />
          </label>

          <div className="settings-row settings-row-select">
            <div className="settings-label">
              <span className="settings-name">代码块语法高亮主题</span>
              <span className="settings-desc">独立于应用明暗模式的代码配色</span>
            </div>
            <select
              className="settings-select"
              value={codeBlockTheme}
              onChange={(e) => setCodeBlockTheme(e.target.value as CodeBlockTheme)}
            >
              {CODE_THEME_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="settings-footer">
          <button className="settings-reset" onClick={reset}>
            恢复默认
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;
