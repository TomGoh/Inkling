// 编辑器错误边界
// 包裹 Milkdown 编辑器，捕获初始化/解析/渲染抛出的异常，
// 避免整个 React 树卸载导致白屏。出错时显示降级 UI + 报错信息 + 重试按钮。

import { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
  /** 子节点 */
  children: ReactNode;
  /** 出错时的文件名（用于提示） */
  fileName?: string | null;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class EditorErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  /** 文件切换时重置错误状态，尝试用新文件重新渲染 */
  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (prevProps.fileName !== this.props.fileName && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const err = this.state.error;
      return (
        <div className="editor-error">
          <div className="editor-error-icon">⚠️</div>
          <h3 className="editor-error-title">该文件渲染失败</h3>
          <p className="editor-error-desc">
            {this.props.fileName
              ? `「${this.props.fileName}」内容触发了编辑器异常，可能包含特殊语法。`
              : "文件内容触发了编辑器异常。"}
            内容未丢失，可切换其他文件继续使用。
          </p>
          {err && (
            <pre className="editor-error-detail">{err.message}</pre>
          )}
          <div className="editor-error-actions">
            <button className="editor-error-btn" onClick={this.handleRetry}>
              重试
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default EditorErrorBoundary;
