// 「打开文件后滚到锚点」的一次性登记表（#296）
//
// 为什么用模块级 Map 而不是 React state：
// 点击发生在非 React 的插件回调里，目标编辑器可能**尚未挂载**（新 tab）；登记表让
// 「先请求、后消费」与「先挂载、后请求」两种时序都成立。
//
// 约束：
// - 键为 `pathKey`（normalize + Windows 大小写折叠），避免链接解析与 tab 路径仅大小写不同而漏消费；
// - 同一路径只保留最近 1 条，消费即删；
// - 容量上限 8 条，超出淘汰最早（防止打开失败/目标未挂载时无限堆积）。

import { pathKey } from "./path-utils";

/** 容量上限：超出后淘汰最早登记的一条 */
const MAX_PENDING_ANCHORS = 8;

const pending = new Map<string, string>();

/** 登记「打开 path 后滚到 fragment」。空路径/空片段忽略。 */
export function requestPendingAnchor(path: string, fragment: string): void {
  if (!path || !fragment) return;
  const key = pathKey(path);
  // 重新登记同一条路径时先删后插：既保证「最近一条优先」，也刷新淘汰顺序
  pending.delete(key);
  pending.set(key, fragment);
  while (pending.size > MAX_PENDING_ANCHORS) {
    const oldest = pending.keys().next().value;
    if (oldest === undefined) break;
    pending.delete(oldest);
  }
}

/** 撤销登记（打开失败时调用，避免日后误消费）。 */
export function cancelPendingAnchor(path: string): void {
  if (!path) return;
  pending.delete(pathKey(path));
}

/** 消费一次即删；没有登记返回 null。 */
export function consumePendingAnchor(path: string): string | null {
  if (!path) return null;
  const key = pathKey(path);
  const fragment = pending.get(key) ?? null;
  if (fragment !== null) pending.delete(key);
  return fragment;
}

/** 仅测试用：清空全部登记。 */
export function __resetPendingAnchors(): void {
  pending.clear();
}
