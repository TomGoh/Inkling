# 贡献指南

感谢你对 InklingMD 的兴趣！无论是提 issue、修 bug、加功能还是改文档，都非常欢迎。

## 行为准则

请保持友善、尊重所有贡献者。技术讨论对事不对人，禁止任何人身攻击或歧视性言论。

## 如何贡献

### 报告问题 / 提建议

1. 先在 [Issues](https://github.com/zhkp/InklingMD/issues) 搜索是否已有人提过，避免重复。
2. 没有的话新建 issue，选择对应模板（Bug 报告 / 功能建议），按模板填写：
   - **Bug**：复现步骤、预期结果、实际结果、环境（OS / InklingMD 版本）、截图或日志。
   - **功能建议**：想解决什么场景、期望的效果、是否有替代方案。

### 提交代码

1. **Fork** 本仓库并 clone 到本地。
2. 基于最新 `main` 创建分支：`git checkout -b fix/xxx` 或 `feat/xxx`。
3. 安装依赖：`pnpm install`。
4. 开发，确保以下检查通过：
   - `npx tsc --noEmit` 无类型错误
   - `pnpm build` 构建成功
5. **提交规范**：commit message 建议用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：
   - `fix: 修复中文句号字形`
   - `feat: 新增导出长图功能`
   - `docs: 更新 README`
   - `refactor: 重构分屏状态管理`
   - `chore: 升级依赖`
6. **Pull Request**：
   - PR 标题同 commit 规范。
   - 在 PR 描述中说明改了什么、为什么改、如何测试。
   - 若关联 issue，写明 `Closes #xxx`，合并后会自动关闭对应 issue。
   - 一个 PR 只做一件事，便于 review 与回滚。

### 开发环境

```bash
pnpm install      # 安装依赖
pnpm dev          # 启动开发服务器（浏览器 + mock 工作区）
pnpm tauri dev    # 启动 Tauri 桌面应用开发模式
pnpm build        # 构建前端
pnpm tauri build  # 打包桌面应用
```

> 浏览器 `pnpm dev` 模式下会使用 mock 工作区，方便脱离 Tauri 环境调试 UI。

## 代码风格

- TypeScript，优先使用类型而非 `any`。
- React 函数组件 + Hooks，避免 class 组件。
- 样式用 CSS（非 CSS-in-JS），新增样式按现有 `App.css` / 组件 `.css` 的命名风格。
- 注释用中文（与现有代码库保持一致），说明「为什么」而非「是什么」。

## 目录结构概览

```
src/
├── components/      # React 组件（Editor / Sidebar / Tabs / Outline 等）
├── store/           # Zustand 状态管理（workspace / theme / ui / shortcuts）
├── lib/             # 工具库（fs / exporter / outline / newWindow 等）
├── App.tsx          # 主应用入口与布局
└── App.css          # 全局样式
src-tauri/           # Tauri 后端（Rust）
docs/                # 需求文档、设计文档
```

## 关于 License

提交的代码将遵循项目的 [MIT License](./LICENSE)。
