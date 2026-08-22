/** Directories ignored during global text search and file scanning */
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "target",
  "dist",
  "build",
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
