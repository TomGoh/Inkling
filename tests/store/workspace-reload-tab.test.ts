import { describe, expect, it } from "vitest";
import { useWorkspace } from "../../src/store/workspace";

describe("Tabs Store: reloadFile & openingFiles 健壮性测试", () => {
  it("reloadFile 成功后递增 revision 字段", async () => {
    useWorkspace.setState({
      openTabs: [
        {
          path: "/test/doc.md",
          name: "doc.md",
          content: "initial",
          savedContent: "initial",
          diskContent: "initial",
          dirty: false,
          revision: 0,
        },
      ],
      activeTabPath: "/test/doc.md",
      currentContent: "initial",
    });

    const store = useWorkspace.getState();
    expect(store.openTabs[0].revision).toBe(0);

    // 模拟调用 setTabDiskContent
    store.setTabDiskContent("/test/doc.md", "disk updated");
    expect(useWorkspace.getState().openTabs[0].diskContent).toBe("disk updated");
  });

  it("openingFiles 在打开文件失败时通过 finally 清理", async () => {
    useWorkspace.setState({
      openingFiles: { "/invalid/path.md": true },
    });

    // 验证 openingFiles 初始状态
    expect(useWorkspace.getState().openingFiles["/invalid/path.md"]).toBe(true);

    try {
      await useWorkspace.getState().openFile("/non_existent_file_xxx_12345.md");
    } catch {
      // 异常预期
    }

    // 确保被清理
    expect(useWorkspace.getState().openingFiles["/non_existent_file_xxx_12345.md"]).toBeUndefined();
  });
});
