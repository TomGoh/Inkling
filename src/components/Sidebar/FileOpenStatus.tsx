// 文件读取状态徽标：局部提示加载或错误，不替换整棵文件树

import { IconAlertTriangle } from "../icons";

export function FileOpenStatus({
  opening,
  error,
}: {
  opening: boolean;
  error?: string;
}) {
  if (opening) {
    return (
      <span className="tree-file-status tree-file-opening" aria-label="正在打开">
        <span className="tree-file-spinner" aria-hidden="true" />
      </span>
    );
  }
  if (error) {
    return (
      <span
        className="tree-file-status tree-file-error"
        aria-label="打开失败，点击重试"
        title={error}
      >
        <IconAlertTriangle size={12} />
      </span>
    );
  }
  return null;
}
