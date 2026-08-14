// outline store 测试
// 验证：快照按文件匹配返回，未匹配时返回稳定的空快照（避免跨文件旧大纲与无谓重渲染）

import { describe, expect, it } from "vitest";
import { EMPTY_EDITOR_OUTLINE } from "../../src/lib/outline";
import { selectOutlineForFile, useOutline } from "../../src/store/outline";

describe("outline store", () => {
  it("文件不匹配时返回空快照", () => {
    useOutline.getState().publish("/a.md", {
      headings: [],
      activeIndex: 1,
    });
    expect(selectOutlineForFile(useOutline.getState(), "/b.md")).toBe(
      EMPTY_EDITOR_OUTLINE,
    );
  });

  it("文件匹配时返回发布的快照", () => {
    const snapshot = {
      headings: [],
      activeIndex: 2,
    };
    useOutline.getState().publish("/a.md", snapshot);
    expect(selectOutlineForFile(useOutline.getState(), "/a.md")).toBe(snapshot);
  });

  it("未发布过任何快照时为空状态", () => {
    expect(selectOutlineForFile(useOutline.getState(), null)).toBe(
      EMPTY_EDITOR_OUTLINE,
    );
  });
});
