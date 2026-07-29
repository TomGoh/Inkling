# Inkling

一款「所见即所得」的本地 Markdown 编辑器，对标 Typora。基于 Tauri 2 + React 19 + Milkdown 构建，编辑与预览融为一体——无需左右分栏、无需切换模式，输入 Markdown 语法后立即渲染成富文本，底层保存的始终是标准 Markdown 纯文本。

## 功能特性

### 编辑器内核
- 实时所见即所得渲染（基于 Milkdown / ProseMirror）
- 支持标题、加粗、斜体、删除线、行内代码、引用块、分割线
- 有序/无序/任务列表，多级嵌套（Tab/Shift+Tab 缩进）
- GFM 表格，附表格工具栏（增删行列、对齐、快速插入）
- 围栏代码块 + 语法高亮（CodeMirror，覆盖主流语言）
- KaTeX 数学公式（行内 `$...$` 与块级 `$$...$$`）
- Mermaid 图表（流程图、时序图、甘特图等）

### 文件与工作区
- **多标签页编辑**：同时打开多个 `.md` 文件，标签页切换，未保存提示与关闭确认
- 文件树侧边栏：以文件夹为单位打开工作区
- **大纲面板**：根据标题生成目录树，点击跳转，当前标题自动高亮
- 自动保存（防抖 2 秒）+ `Ctrl/Cmd+S` 手动保存
- 图片拖拽 / 粘贴自动保存到 `assets` 目录
- 链接跟随：`Ctrl/Cmd+点击` 打开链接

### 导出
- 导出 HTML（含内嵌样式）
- 导出 PDF（调用浏览器打印）

### 样式与主题
- 明暗模式切换
- 支持加载自定义 CSS 覆盖样式（CSS 变量）

### 辅助
- 状态栏字数 / 字符数 / 行数 / 预计阅读时长统计

## 技术栈

| 层 | 选型 |
|---|---|
| 应用外壳 | Tauri 2.x |
| 前端框架 | React 19 + TypeScript |
| 编辑器内核 | Milkdown（基于 ProseMirror） |
| 状态管理 | Zustand |
| 代码高亮 | CodeMirror 6 |
| 公式渲染 | KaTeX |
| 图表 | Mermaid |
| 文件系统 | Tauri 内置 `fs` / `dialog` API |

## 项目结构

```
src/
├── components/
│   ├── Editor/        # Milkdown 编辑器封装及插件（代码块、数学、Mermaid、图片、链接、表格、大纲跟踪）
│   ├── Sidebar/       # 文件树侧边栏
│   ├── Tabs/          # 多标签页栏
│   ├── Outline/       # 大纲面板（标题跳转、当前高亮）
│   └── StatusBar/     # 字数统计状态栏
├── lib/               # 文件读写、导出、大纲解析、字数统计、自动保存
├── store/             # Zustand store（workspace 工作区 / theme 主题）
└── App.tsx
src-tauri/             # Rust 后端（Tauri 配置与命令）
```

## 开发

```bash
# 安装依赖
pnpm install

# 前端开发（浏览器 mock 模式）
pnpm dev

# Tauri 桌面应用开发
pnpm tauri dev

# 构建生产包
pnpm build

# 打包桌面应用
pnpm tauri build
```

> 浏览器 `pnpm dev` 模式下会使用 mock 工作区，方便脱离 Tauri 环境调试 UI。

## 版本记录

- **v0.4.0** 多标签页编辑（标签页切换、关闭确认、文件树已打开标记）
- **v0.3.0** 主题系统与明暗模式、导出 HTML/PDF、大纲面板、Mermaid 图表、KaTeX 公式
- **v0.2.0** 图片渲染与拖拽/粘贴上传、链接跟随
- **v0.1.0** 基础所见即所得编辑器
