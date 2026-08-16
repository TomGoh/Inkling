// 主题下拉菜单：浅色/深色切换、加载/清除自定义 CSS
import { useTheme } from "../../store/theme";
import {
  IconSun,
  IconMoon,
  IconPalette,
  IconX,
  IconChevronDown,
} from "../icons";

interface ThemeMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ThemeMenu({ open, onOpenChange }: ThemeMenuProps) {
  const themeMode = useTheme((s) => s.mode);
  const setThemeMode = useTheme((s) => s.setMode);
  const loadCustomCSS = useTheme((s) => s.loadCustomCSS);
  const clearCustomCSS = useTheme((s) => s.clearCustomCSS);
  const customCSSPath = useTheme((s) => s.customCSSPath);

  return (
    <div className="export-menu">
      <button
        className="topbar-btn topbar-btn-label"
        onClick={() => onOpenChange(!open)}
        title="主题"
      >
        {themeMode === "dark" ? (
          <IconMoon size={15} />
        ) : (
          <IconSun size={15} />
        )}
        {themeMode === "dark" ? "深色" : "浅色"}
        <IconChevronDown size={13} />
      </button>
      {open && (
        <>
          <div className="export-backdrop" onClick={() => onOpenChange(false)} />
          <div className="export-dropdown">
            <button
              className={`export-item${themeMode === "light" ? " export-item-active" : ""}`}
              onClick={() => {
                setThemeMode("light");
                onOpenChange(false);
              }}
            >
              <IconSun size={14} />
              浅色
            </button>
            <button
              className={`export-item${themeMode === "dark" ? " export-item-active" : ""}`}
              onClick={() => {
                setThemeMode("dark");
                onOpenChange(false);
              }}
            >
              <IconMoon size={14} />
              深色
            </button>
            <div className="export-sep" />
            <button
              className="export-item"
              onClick={() => {
                onOpenChange(false);
                void loadCustomCSS();
              }}
            >
              <IconPalette size={14} />
              加载自定义 CSS…
            </button>
            {customCSSPath && (
              <button
                className="export-item export-item-muted"
                onClick={() => {
                  clearCustomCSS();
                  onOpenChange(false);
                }}
              >
                <IconX size={14} />
                清除自定义 CSS
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
