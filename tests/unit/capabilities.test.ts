// capabilities 配置防回归测试
// v1.2.10 修复：alert()/confirm() 在 Tauri webview 中被映射为 dialog.message / dialog.ask
// 若 capabilities 缺少 dialog:allow-message / dialog:allow-ask 权限，
// 全部替换（alert 提示）和所有 confirm 弹窗都会报 "command plugin: dialog|message not allowed acl"
// 此测试确保权限配置不回退

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readCapabilities() {
  const path = resolve(__dirname, "../../src-tauri/capabilities/default.json");
  return JSON.parse(readFileSync(path, "utf-8"));
}

describe("capabilities/default.json ACL 权限配置（v1.2.10 防回归）", () => {
  const caps = readCapabilities();
  const permissions: string[] = caps.permissions;

  it("包含 dialog:allow-message（alert() 映射需要）", () => {
    expect(permissions).toContain("dialog:allow-message");
  });

  it("包含 dialog:allow-ask（confirm() 映射需要）", () => {
    expect(permissions).toContain("dialog:allow-ask");
  });

  it("保留 dialog:allow-open 和 dialog:allow-save", () => {
    expect(permissions).toContain("dialog:allow-open");
    expect(permissions).toContain("dialog:allow-save");
  });

  it("包含全部 13 个自定义 app command 权限", () => {
    const expected = [
      "allow-list-dir",
      "allow-read-text-file",
      "allow-write-text-file",
      "allow-write-binary-file",
      "allow-file-mtime",
      "allow-rename-path",
      "allow-delete-path",
      "allow-create-file",
      "allow-create-dir",
      "allow-search-in-workspace",
      "allow-pandoc-check",
      "allow-pandoc-export-docx",
      "allow-take-pending-file",
    ];
    for (const p of expected) {
      expect(permissions).toContain(p);
    }
  });
});
