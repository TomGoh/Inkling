// markdown-publisher 插件测试
// 验证：序列化防抖合并、doc 未变不触发、源码模式跳过、
// 与 lastSynced 相同不回调、blur/销毁立即 flush

import { afterEach, describe, expect, it, vi } from "vitest";
import { markdownPublisherPlugin } from "../../src/components/Editor/markdown-publisher";

interface FakeDoc {
  id: number;
}

function setup(options?: { sourceMode?: boolean; initialSynced?: string }) {
  const onChange = vi.fn();
  const serialize = vi.fn((doc: unknown) => `md-${(doc as FakeDoc).id}`);
  let lastSynced = options?.initialSynced ?? "md-0";
  const plugin = markdownPublisherPlugin({
    serialize,
    isSourceMode: () => options?.sourceMode ?? false,
    getLastSynced: () => lastSynced,
    setLastSynced: (md) => {
      lastSynced = md;
    },
    onChange,
  });
  const dom = document.createElement("div");
  document.body.append(dom);
  // 模拟活的 EditorView：state.doc 随 update 更新
  const view = { dom, state: { doc: { id: 0 } as FakeDoc } };
  const pluginView = plugin.spec.view?.(
    view as never,
  ) as unknown as {
    update: (next: never, prev: never) => void;
    destroy: () => void;
  };
  const bump = (id: number) => {
    // PM 约定：update(view, prevState)，prevState 为 EditorState（doc 在顶层）
    const prevState = { doc: view.state.doc };
    view.state.doc = { id };
    pluginView.update(
      { state: { doc: view.state.doc } } as never,
      prevState as never,
    );
  };
  return { onChange, serialize, pluginView, dom, bump };
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("markdownPublisherPlugin", () => {
  it("连续 doc 变更在防抖窗口内只序列化并发布一次", () => {
    vi.useFakeTimers();
    const { onChange, serialize, bump } = setup();
    bump(1);
    bump(2);
    bump(3);
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(160);
    // 只取最新 doc 序列化一次
    expect(serialize).toHaveBeenCalledTimes(1);
    expect(serialize).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("md-3");
  });

  it("doc 未变化的 transaction 不触发序列化", () => {
    vi.useFakeTimers();
    const { onChange, serialize, pluginView } = setup();
    const doc = { id: 0 };
    pluginView.update(
      { state: { doc } } as never,
      { doc } as never,
    );
    vi.advanceTimersByTime(300);
    expect(serialize).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("序列化结果与外部同步值相同时不回调（防循环）", () => {
    vi.useFakeTimers();
    const { onChange, bump } = setup({ initialSynced: "md-1" });
    bump(1);
    vi.advanceTimersByTime(160);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("源码模式下不发布", () => {
    vi.useFakeTimers();
    const { onChange, serialize, bump } = setup({ sourceMode: true });
    bump(1);
    vi.advanceTimersByTime(160);
    expect(serialize).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("blur 立即 flush 待定序列化", () => {
    vi.useFakeTimers();
    const { onChange, dom, bump } = setup();
    bump(7);
    dom.dispatchEvent(new Event("blur"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("md-7");
  });

  it("销毁时 flush 待定序列化", () => {
    vi.useFakeTimers();
    const { onChange, pluginView, bump } = setup();
    bump(9);
    pluginView.destroy();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("md-9");
  });
});
