// 源码模式查找替换的命令路由（issue #29）
// 全局快捷键（App.tsx）在源码模式下不再弹出 WYSIWYG SearchPanel / 提示退出，
// 而是通过这里把 Ctrl+F / Ctrl+R 定向到当前激活 tab 对应的 CodeMirror 实例，
// 打开 CM 内置查找/替换面板。分屏时按 filePath 精确命中，不误触隐藏编辑器。

type SourceModeSearchRunner = (opts: { replace: boolean }) => void;

const registry = new Map<string, SourceModeSearchRunner>();

/** SourceModeEditor 挂载时注册自己的命令执行器 */
export function registerSourceModeSearch(filePath: string, run: SourceModeSearchRunner) {
  registry.set(filePath, run);
}

/** SourceModeEditor 卸载时注销 */
export function unregisterSourceModeSearch(filePath: string) {
  registry.delete(filePath);
}

/**
 * 对指定文件路径的源码模式编辑器打开查找/替换面板。
 * 未注册（非源码模式或实例未挂载）时返回 false，调用方自行兜底。
 */
export function runSourceModeSearch(
  filePath: string | null | undefined,
  opts: { replace: boolean },
): boolean {
  if (!filePath) return false;
  const run = registry.get(filePath);
  if (!run) return false;
  run(opts);
  return true;
}
