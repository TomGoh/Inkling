/**
 * 通用 JSON 持久化存储工具，提供严格的类型检查与安全容错
 */

export function loadJSON<T>(
  key: string,
  fallback: T,
  validate?: (val: unknown) => val is T
): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (validate) {
      return validate(parsed) ? parsed : fallback;
    }
    // 默认如果 fallback 是纯对象，则做浅合并且过滤非对象值
    if (fallback !== null && typeof fallback === "object" && !Array.isArray(fallback)) {
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return { ...fallback, ...parsed };
      }
      return fallback;
    }
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function writeJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 忽略 localStorage 满或安全限制导致的异常
  }
}
