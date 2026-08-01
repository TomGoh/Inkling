// 测试全局 setup
// - 注册 @testing-library/jest-dom 的 DOM 断言匹配器
// - 每个用例间清理 localStorage，避免 store 持久化串扰

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";

// happy-dom 不实现 matchMedia，部分库（如主题相关）会调用，桩一个最小实现
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});
