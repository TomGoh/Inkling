// E2E 共享辅助函数

import { test, expect, type Page } from "@playwright/test";

// 每个用例前先打开 mock 工作区（浏览器版不自动加载，需点按钮）
export async function openMockWorkspace(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "打开文件夹" }).click();
  await expect(page.locator(".sidebar-tree").getByText("mock-workspace")).toBeVisible({ timeout: 10_000 });
}

// 在已打开的工作区里点某个文件，等编辑器就绪
export async function openFile(page: Page, fileName: string) {
  await page.locator(".sidebar-tree").getByText(fileName, { exact: true }).click();
  await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 10_000 });
}

// 在编辑器末尾追加内容并保证落在可编辑段落
export async function appendToEditor(page: Page, text: string) {
  await page.locator(".ProseMirror").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(text);
}

// v2.0.1 回归 fixture：用户报告出现裁切的原样流程图代码
export const MULTILINE_FLOWCHART = `flowchart TB
    A["① 请求进入<br/>A2A Task / 调试界面"] --> B["② 加载 Agent Definition<br/>prompt + 工具列表 + 知识库列表"]
    B --> C["③ Context Builder 组装上下文<br/>system_prompt + 历史对话 + 用户输入 + 工具Schema"]
    C --> D["④ 调用 LLM 推理"]
    D --> E{"需要工具？"}
    E -- 是 --> F["⑤ 通过 MCP Client 调用对应 MCP Server<br/>知识库检索也是走这里"]
    F --> G["⑥ 工具/检索结果写回上下文"]
    G --> D
    E -- 否 --> H["⑦ 返回最终答案<br/>写入 Session Store + A2A Task 返回"]

    style D fill:#eef2ff,stroke:#4f46e5,stroke-width:2px
    style F fill:#e0f2fe,stroke:#0ea5e9,stroke-width:2px`;

// 平台无关地按下修饰键组合（macOS 用 Meta，其他用 Control）
export const MOD = process.platform === "darwin" ? "Meta" : "Control";
