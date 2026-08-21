// 文件树辅助：合并按需加载结果，并生成窗口化列表所需的可见行

import type { FileNode } from "./fs";

/** 文件树中当前可见的一行 */
export interface VisibleFileNode {
  node: FileNode;
  depth: number;
}

/** 合并单层目录枚举结果，并保留同路径下已经加载的后代 */
export function mergeDirectoryListing(root: FileNode, listing: FileNode): FileNode {
  if (root.path === listing.path) {
    const existingChildren = new Map(root.children.map((child) => [child.path, child]));
    const children = listing.children.map((child) => {
      const existing = existingChildren.get(child.path);
      if (existing?.is_dir && child.is_dir) {
        return { ...child, children: existing.children };
      }
      return child;
    });
    return { ...listing, children };
  }

  if (!root.is_dir || root.children.length === 0) return root;

  let changed = false;
  const children = root.children.map((child) => {
    const next = mergeDirectoryListing(child, listing);
    if (next !== child) changed = true;
    return next;
  });
  return changed ? { ...root, children } : root;
}

/** 按展开状态生成供窗口化列表使用的扁平行 */
export function flattenVisibleTree(
  root: FileNode,
  expandedDirs: ReadonlySet<string>,
): VisibleFileNode[] {
  const rows: VisibleFileNode[] = [];
  const stack: VisibleFileNode[] = [{ node: root, depth: 0 }];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    rows.push(current);

    if (!current.node.is_dir || !expandedDirs.has(current.node.path)) continue;
    for (let i = current.node.children.length - 1; i >= 0; i -= 1) {
      stack.push({ node: current.node.children[i], depth: current.depth + 1 });
    }
  }

  return rows;
}

/** 收集当前局部树中存在的目录路径 */
export function collectDirectoryPaths(root: FileNode): Set<string> {
  const paths = new Set<string>();
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || !node.is_dir) continue;
    paths.add(node.path);
    for (const child of node.children) stack.push(child);
  }
  return paths;
}

/** 统一规范化路径：将 Windows 反斜杠替换为正斜杠，并将 Windows 盘符首字母统一大写 */
export function normalizePath(p: string): string {
  if (!p) return "";
  let norm = p.replace(/\\/g, "/");
  // 匹配形如 c:/ 或 c: 的 Windows 盘符并将其转为大写 C:/
  if (/^[a-zA-Z]:/.test(norm)) {
    norm = norm.charAt(0).toUpperCase() + norm.slice(1);
  }
  return norm;
}

/** 判断路径是否等于指定目录，或位于该目录之下 */
export function isPathWithin(path: string, prefix: string): boolean {
  const normPath = normalizePath(path);
  const normPrefix = normalizePath(prefix);
  if (normPath === normPrefix) return true;
  if (normPrefix.endsWith("/")) return normPath.startsWith(normPrefix);
  return normPath.startsWith(normPrefix + "/");
}
