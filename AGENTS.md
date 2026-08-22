# InklingMD 开发与发版规范指南

本规范适用于在本项目中进行开发、发版与打包的所有 AI Agent 及开发者。无论在哪个新会话中，只要收到「打包 / 发布 / 发版」指令，必须严格遵循以下 SOP 标准流程。

---

## 🚀 发版与打包标准作业程序（Release SOP）

收到打包或发版指令后，**必须按顺序执行以下 5 个阶段**，严禁跳过任何前置检查！

### 第一阶段：测试补充与全量验证
1. **核对单测/集成测试覆盖**：
   - 检查本次提交涉及的代码变更，是否已有对应真实有效的前端 Vitest 单元测试 / E2E 测试或 Rust 测试。
   - 若为新功能、Bug 修复或重大重构，必须先补充真实的测试用例（禁止写 mock 假断言）。
2. **运行全量测试**：
   - 前端测试：`export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" && nvm use 22 && npm run test`（必须 100% PASS）。
   - 前端编译：`npm run build`（验证 TypeScript 类型检查与 Vite 构建零报错）。

### 第二阶段：文档全量更新（内容 + 版本号）
必须同时更新以下 **4 个文档**，不能只改版本号，必须补充具体改动内容：
1. **`docs/Markdown编辑器需求文档.md`**：
   - 顶部文档版本号更新为最新版（如 `> 文档版本：vX.Y.Z`）。
   - 功能清单矩阵中增加/更新本次版本的对应条目。
   - 8.2 节「版本历史」追加本次版本的发布日志。
2. **`docs/vX.Y.Z 设计文档.md`**：
   - 新建对应版本的独立设计文档，详细记录问题根因、架构决策、数据流变化、防御策略与测试设计。
3. **`CHANGELOG.md`**：
   - 在顶部添加最新版本的 Release Notes（分类记录：新增功能 / 修复与优化 / 测试与重构）。
4. **`README.md`**：
   - 更新版本历史部分，**严格保持仅展示最近 5 个版本**，旧版本归档在 CHANGELOG 中。

### 第三阶段：4 处版本号严格同步与脚本校验
1. **必须同步更新 4 处版本号**：
   - `package.json`（`"version": "X.Y.Z"`）
   - `src-tauri/tauri.conf.json`（`"version": "X.Y.Z"`）
   - `src-tauri/Cargo.toml`（`version = "X.Y.Z"`）
   - `src-tauri/Cargo.lock`（`[[package]] name = "inklingmd" version = "X.Y.Z"`）
2. **执行校验脚本**：
   - `node scripts/check-version.mjs`（验证 4 处版本号完全一致）。
   - `node scripts/check-docs-updated.mjs`（验证文档更新范围与一致性）。

### 第四阶段：Git 提交与打 Tag
1. 将所有代码修改、测试文件、4 处版本号和 4 个文档一并暂存：
   ```bash
   git add .
   git commit -m "fix/feat: 简洁明了的提交信息 + 发版 vX.Y.Z"
   git tag vX.Y.Z
   ```

### 第五阶段：推送触发 CI 与全流程监控
1. **推送到 GitHub 远程仓库**：
   ```bash
   git push origin main --tags
   ```
2. **实时监控 GitHub Actions 流水线**：
   - 查询当前运行的 Run ID：`gh run list --limit 3`。
   - 使用 `gh run watch <RUN_ID> --interval 15` 进行实时监控。
   - 若发生超时或失败，使用 `gh run view <RUN_ID>` / `gh run view <RUN_ID> --log-failed` 排查原因并立即修复重新触发。
   - 监控直至 `release-guard`、`test (ubuntu)`、`test (windows)`、`build-linux`、`build-windows` 以及 `release` 全部显示 `✓ success`。
3. **确认 Release 资产发布**：
   - 运行 `gh release view vX.Y.Z` 确认安装包（EXE/MSI/Portable ZIP/AppImage/deb）已成功挂载在 GitHub Release 上。
