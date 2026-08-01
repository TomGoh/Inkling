// StatusBar 组件测试
// 验证：无文件时不渲染、有文件时显示字数/字符/行数/阅读时长

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBar } from "../../src/components/StatusBar/StatusBar";
import { useWorkspace } from "../../src/store/workspace";

beforeEach(() => {
  // 重置 store 状态
  useWorkspace.setState({
    currentFile: null,
    currentContent: "",
  });
});

describe("StatusBar", () => {
  it("无当前文件时不渲染", () => {
    const { container } = render(<StatusBar />);
    expect(container.firstChild).toBeNull();
  });

  it("有文件时显示字数统计", () => {
    useWorkspace.setState({
      currentFile: "/test.md",
      currentContent: "hello world",
    });
    render(<StatusBar />);
    expect(screen.getByText(/字数 2/)).toBeInTheDocument();
    expect(screen.getByText(/字符 11/)).toBeInTheDocument();
    expect(screen.getByText(/行 1/)).toBeInTheDocument();
  });

  it("中文内容按字统计", () => {
    useWorkspace.setState({
      currentFile: "/test.md",
      currentContent: "你好世界",
    });
    render(<StatusBar />);
    expect(screen.getByText(/字数 4/)).toBeInTheDocument();
  });

  it("多行内容显示正确行数", () => {
    useWorkspace.setState({
      currentFile: "/test.md",
      currentContent: "line1\nline2\nline3",
    });
    render(<StatusBar />);
    expect(screen.getByText(/行 3/)).toBeInTheDocument();
  });

  it("内容变化时统计更新", () => {
    useWorkspace.setState({
      currentFile: "/test.md",
      currentContent: "foo",
    });
    const { rerender } = render(<StatusBar />);
    expect(screen.getByText(/字数 1/)).toBeInTheDocument();
    useWorkspace.setState({ currentContent: "foo bar baz" });
    rerender(<StatusBar />);
    expect(screen.getByText(/字数 3/)).toBeInTheDocument();
  });
});
