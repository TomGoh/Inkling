/** 搜索忽略目录：与 Rust 侧 src-tauri/src/commands/search.rs IGNORED_SEARCH_DIRS 保持同步 */
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "target",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".nuxt",
  ".cache",
  ".codegraph",
  ".obsidian",
]);

export function isIgnoredSearchDir(dirName: string): boolean {
  return IGNORED_DIRS.has(dirName.trim().toLowerCase());
}
