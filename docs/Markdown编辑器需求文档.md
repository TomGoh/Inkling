# Markdown 所见即所得编辑器 —— 产品需求文档（PRD）

> 对标产品：Typora
> 文档版本：v2.3.2
> 用途：作为 AI 辅助编程（vibe coding）的开发依据

---

## 1. 项目背景与目标

Typora 是一款"所见即所得"（WYSIWYG）的 Markdown 编辑器，核心卖点是**编辑与预览融为一体**——不需要左右分栏、不需要切换模式，输入 Markdown 语法后立即渲染成排版好的富文本样式，但底层保存的仍是标准 Markdown 文本。目前 Typora 采用买断制付费（约 $14.99，15 天试用），本项目目标是自研一款功能对等、可自由定制的替代品，供个人使用。

**核心目标：**
- 完全私有部署，不依赖任何账号/联网激活
- 功能覆盖 Typora 90% 以上高频使用场景
- 可按自己喜好扩展（如接入 AI 辅助写作、自定义快捷键等）

---

## 2. 产品定位

一款跨平台（至少支持桌面端，Windows/macOS，可选 Web 版）的本地 Markdown 文件编辑器，核心理念："所见即所写"——用户看到的排版效果就是最终效果，无需在"源码模式"和"预览模式"之间切换。

---

## 3. 核心功能模块

### 3.1 编辑器内核（最核心，优先级最高）

这是整个项目技术难度最大的部分，决定产品体验上限。

- **实时所见即所得渲染**：光标所在行/块显示 Markdown 源码语法符号（如 `**`、`#`、`- `），光标离开后该块自动渲染为富文本样式（如加粗、标题、列表）
- **富文本操作映射到 Markdown**：用户在渲染后的文本上直接选中加粗、插入链接等操作，需自动生成对应的 Markdown 语法并写回文本
- **底层数据始终是标准 Markdown 纯文本**，不产生任何私有格式，保证可移植性
- **撤销/重做**、**多光标编辑**（可选，进阶功能）
- 自动补全：输入 `**` 自动补全为 `****` 并把光标放在中间；输入 `[` 自动补全 `]`；反引号、括号、引号自动配对（可在设置中开关）

### 3.2 Markdown 语法支持范围

| 类别 | 具体语法 |
|---|---|
| 基础 | 标题 H1-H6、加粗、斜体、删除线、行内代码、引用块、分割线、软换行/硬换行 |
| 列表 | 有序列表、无序列表、任务列表（`- [ ]` / `- [x]`）、多级嵌套列表（Tab/Shift+Tab 缩进） |
| 链接与图片 | 普通链接、引用式链接、图片插入、图片自定义宽度/缩放（`<img>` 标签方式）、内部锚点跳转（链接到标题） |
| 表格 | GFM 表格语法，鼠标拖拽调整列宽、快速插入指定行列数的表格、行列快速增删排序 |
| 代码块 | 围栏代码块 ```` ``` ````、语言标注、语法高亮（覆盖主流 ~100 种语言）、显示行号 |
| 数学公式 | 行内公式 `$...$`、块级公式 `$$...$$`，基于 MathJax/KaTeX 渲染，支持化学方程式（mhchem）、公式自动编号 |
| 图表 | Mermaid（流程图、时序图、甘特图、类图等）、可选 flowchart.js / sequence diagram |
| 其他 | 脚注、YAML Front Matter（文档元数据）、目录 `[TOC]` 自动生成、表情符号 `:emoji:` 自动补全、HTML 内嵌标签渲染 |

### 3.3 文件与工作区管理

- **文件树侧边栏**：以文件夹为单位打开工作区，树状展示所有 `.md` 文件及子目录
- **大纲面板**：根据文档内标题自动生成目录结构，点击可跳转到对应位置
- **多标签页**：同时打开多个文件
- **自动保存** + 手动保存，文件变更监听（外部修改后提示重新加载）

### 3.4 导入导出

- 导出：PDF（保留书签）、HTML（含内嵌样式）、Word（.docx）、图片（长图）
- 导入：Word、HTML 转 Markdown（可选，优先级较低）
- 复制为富文本（粘贴到其他软件时保留样式）、复制为纯 Markdown 源码

### 3.5 样式与主题

- **内置多套主题**，主题本质是一份 CSS 文件
- **支持用户自定义 CSS**，允许通过覆盖 CSS 变量自由调整字体、字号、行距、配色
- 明暗模式切换（跟随系统 / 手动）
- 代码块语法高亮主题独立可配置

### 3.6 辅助写作功能

- **字数统计**：字数、字符数、行数、预计阅读时长，实时显示在状态栏
- **专注模式（Focus Mode）**：非当前段落做模糊/弱化处理
- **打字机模式（Typewriter Mode）**：当前编辑行始终保持在视窗垂直居中
- **大纲/侧边导航同步高亮**：编辑到某处，大纲面板自动高亮对应标题
- 查找与替换（支持正则）

### 3.7 图片处理

- 粘贴截图/拖拽图片自动插入并复制到本地图片文件夹（相对路径管理），避免图片丢失
- 图片相对路径与绝对路径切换
- 可选：接入图床（如 GitHub、七牛云、自建 S3）实现自动上传并替换为在线链接

### 3.8 快捷键与偏好设置

- 完整的快捷键体系（加粗 Ctrl/Cmd+B、斜体 Ctrl/Cmd+I 等），支持自定义
- 偏好设置面板：字体、主题、自动保存间隔、Markdown 语法细节开关（如是否严格遵循 CommonMark）

---

## 4. 非功能性需求

| 维度 | 要求 |
|---|---|
| 性能 | 万字长文档编辑无明显卡顿；大文件（图片较多）打开时间 < 2s |
| 跨平台 | 优先 Windows + macOS，技术选型建议使用 Electron 或 Tauri 保证跨平台一致性 |
| 数据安全 | 本地优先，不强制联网、不上传用户内容；自动备份/崩溃恢复 |
| 可扩展性 | 插件机制预留（如未来接入 AI 续写/润色能力） |
| 兼容性 | 生成的 Markdown 需兼容 GitHub/主流静态博客引擎（Hugo、Hexo 等）的解析规则 |

---

## 5. 技术方案建议（供 vibe coding 参考）

考虑到是个人独立开发，建议技术栈：

- **应用框架**：Tauri（更轻量、包体小、性能好）或 Electron（生态成熟、开发更快）
- **编辑器内核**：这是最关键也最难的部分，两个方向：
  1. 基于 **ProseMirror** 或 **Milkdown**（已经是基于 ProseMirror 封装的所见即所得 Markdown 方案，开源，可大幅降低开发难度，强烈建议优先调研）
  2. 基于 **CodeMirror 6** 做"半所见即所得"（语法高亮+实时局部渲染，比纯 WYSIWYG 简单很多，是很多轻量编辑器的折中方案，如 Obsidian Live Preview 的思路）
- **公式渲染**：KaTeX（比 MathJax 快，功能略少但够用）
- **图表渲染**：Mermaid.js（直接引入其官方库即可）
- **代码高亮**：Shiki 或 highlight.js
- **文件系统操作**：Tauri/Electron 原生 API
- **导出 PDF/Word**：可调用 Pandoc（命令行工具，功能强大，社区成熟，避免自己写转换逻辑）

> 建议：Milkdown 是目前开源生态中最接近 Typora 所见即所得体验的方案，先花时间验证它能否覆盖 3.2 节中列出的语法需求，可以省去自研编辑器内核的巨大工作量。

---

## 6. MVP 优先级划分

**P0（必须，第一版）**
- 基础语法所见即所得（标题/加粗/斜体/列表/引用/代码块/表格/链接图片）
- 文件树 + 打开/保存/自动保存
- 基础主题（1套即可）+ 字数统计

**P1（第二版）**
- 数学公式、Mermaid 图表、大纲面板、导出 PDF/HTML
- 自定义 CSS 主题、明暗模式

**P2（后续迭代）**
- 专注模式/打字机模式、脚注/TOC、图床集成、导出 Word、快捷键自定义、正则查找替换

---

## 7. 差异化机会（自研的额外价值）

既然是自己开发，可以在功能对等的基础上加入 Typora 没有的能力，例如：
- 接入 AI 能力（选中文字润色/翻译/续写、根据大纲自动生成初稿）
- 双向链接/知识库能力（借鉴 Obsidian）
- 免费开源、无需买断付费

---

*本文档可作为向 AI 编程工具（如 Claude Code）拆解开发任务的输入依据，建议按第 6 节的优先级逐步实现并验证。*

---

## 8. 实现进度（截至 v1.0.0）

> 本节用于对照 PRD 需求与实际落地情况，方便后续迭代决策。详细技术方案与任务拆解见 `技术方案与任务拆解.md`。

### 8.1 已实现功能

| PRD 章节 | 需求 | 状态 | 落地版本 | 说明 |
|---|---|---|---|---|
| 3.1 | 实时所见即所得渲染 | ✅ | v0.1.0 | 基于 Milkdown 7 / ProseMirror |
| 3.1 | 撤销/重做 | ✅ | v0.1.0 | Milkdown 内置 |
| 3.2 基础 | 标题/加粗/斜体/删除线/行内代码/引用/分割线 | ✅ | v0.1.0 | commonmark + gfm preset |
| 3.2 列表 | 有序/无序/任务列表/嵌套 | ✅ | v0.1.0 | |
| 3.2 表格 | GFM 表格、行列增删、对齐 | ✅ | v0.2.0 | `TableToolbar.tsx`；列宽拖拽未实现 |
| 3.2 代码块 | 围栏代码块、语言标注、语法高亮 | ✅ | v0.2.0 | CodeMirror 6（替代初版 Shiki），含行号 |
| 3.2 数学公式 | 行内 `$...$` / 块级 `$$...$$` | ✅ | v0.3.0 | KaTeX；含 mhchem 化学方程式、公式自动编号（v0.5.0） |
| 3.2 图表 | Mermaid | ✅ | v0.3.0 | 流程图/时序图/甘特图等 |
| 3.2 其他 | 脚注 / `[TOC]` / YAML Front Matter | ✅ | v0.5.0 | GFM 脚注 + 自定义 NodeView；TOC 自动生成；Front Matter 走 remark-frontmatter + CodeMirror 视图 |
| 3.3 | 文件树侧边栏 | ✅ | v0.1.0 | 支持显隐切换（v0.5.0） |
| 3.3 | 大纲面板（点击跳转 + 高亮） | ✅ | v0.3.0 | `OutlinePanel.tsx` + `outline-tracker.ts`；支持显隐切换（v0.5.0） |
| 3.3 | 多标签页 | ✅ | v0.4.0 | `Tabs/TabsBar.tsx` |
| 3.3 | 自动保存 + 手动保存 | ✅ | v0.1.0 | 防抖 2 秒 + Ctrl/Cmd+S |
| 3.3 | 文件变更监听（外部修改提示重载） | ✅ | v0.5.0 | `useFileWatcher` 轮询 mtime，仅桌面端 |
| 3.4 | 导出 HTML | ✅ | v0.3.0 | 含内嵌样式 |
| 3.4 | 导出 PDF | ✅ | v0.3.0 | 浏览器打印（未用 Pandoc） |
| 3.4 | 导出 Word | ✅ | v0.6.0 | 走 Pandoc（Rust command 调用本地 pandoc），未安装时给出引导提示 |
| 3.4 | 复制为富文本 / 纯 Markdown | ✅ | v0.5.0 | `exporter.ts` 中 `copyRichText` / `copyMarkdown` |
| 3.5 | 主题系统 + 自定义 CSS | ✅ | v0.3.0 | `theme.ts`，加载自定义 CSS 文件 |
| 3.5 | 明暗模式切换 | ✅ | v0.3.0 | |
| 3.5 | 代码块语法高亮主题独立配置 | ✅ | v0.5.0 | `settings.ts` + `code-block-view.ts` 动态重配 |
| 3.6 | 字数统计 | ✅ | v0.1.0 | 字数/字符数/行数/阅读时长 |
| 3.6 | 专注模式 / 打字机模式 | ✅ | v0.5.0 | `editor-modes.ts`，运行时切换 |
| 3.6 | 查找替换（正则） | ✅ | v0.5.0 | `search.ts` + `SearchPanel.tsx`，Ctrl/Cmd+F |
| 3.7 | 图片拖拽/粘贴自动入库 | ✅ | v0.2.0 | 相对路径引用 `assets/` |
| 3.7 | 图床集成 | ❌ | — | 可选，未规划 |
| 3.8 | 快捷键体系 | ✅ | v0.5.0 | Milkdown 预设 + 应用级快捷键 + 帮助面板（Ctrl/Cmd+/） |
| 3.8 | 快捷键自定义面板 | ✅ | v0.6.0 | `shortcuts.ts` + `ShortcutsCustomize.tsx`，支持捕获式绑定、冲突检测、一键恢复默认 |
| 3.8 | 偏好设置面板 | ✅ | v0.5.0 | `SettingsPanel.tsx`，含专注/打字机/公式编号/代码主题 |
| 3.2 其他 | callout 提示框 | ✅ | v0.7.0 | `callout.ts`，支持 `> [!NOTE/WARNING/TIP/IMPORTANT]` GFM 语法，自定义 NodeView 配色 |
| 3.2 其他 | 斜杠菜单 `/` | ✅ | v0.7.0 | `slash-menu.ts` ProseMirror 插件，空行输入 `/` 弹出块类型菜单 |
| 3.3 | 全局搜索 | ✅ | v0.7.0 | `search.rs` + `GlobalSearchPanel.tsx`，`Ctrl+Shift+F` 跨工作区搜索 |
| 3.3 | 标签页右键菜单 + 拖拽重排 | ✅ | v0.7.0 | `TabContextMenu.tsx` + `reorderTabs`/`closeOthers`/`closeToRight` |
| 3.3 | 文件树重命名/删除/新建 | ✅ | v0.7.0 | `rename_path`/`delete_path`/`create_file`/`create_dir` Rust 命令 + 行内重命名 |
| 3.3 | 最近打开文件列表 | ✅ | v0.7.0 | `recentFiles` 持久化到 localStorage，侧边栏顶部展示 |
| 3.3 | 编辑位置记忆 | ✅ | v0.7.0 | `saveCursorState`/`getActiveCursorState`，关闭重开恢复光标与滚动 |
| 3.8 | 编辑器错误边界 | ✅ | v0.7.0 | `EditorErrorBoundary.tsx`，渲染异常时降级 UI 而非白屏 |
| 3.2 | 自动配对补全 | ✅ | v0.8.0 | `auto-pair.ts`，括号/引号配对，含中文引号/书名号，可在设置开关 |
| 3.2 | 图片缩放/对齐 | ✅ | v0.8.0 | `image-node-view.ts`，拖拽手柄缩放，右键菜单对齐，width/align 编码进 title 持久化 |
| 3.2 | 行内图片格式 | ✅ | v0.8.0 | NodeView 改用 inline-block span，图片在文字流行内显示 |
| 3.3 | 禅模式 | ✅ | v0.8.0 | `ui.ts` zenMode，F11 进入 / Esc 退出，隐藏所有 UI |
| 3.3 | 文件夹折叠状态记忆 | ✅ | v0.8.0 | `collapsedDirs` 持久化到 localStorage，重启恢复 |
| 3.3 | 书签/收藏 | ✅ | v0.8.0 | `bookmarks` 持久化，侧边栏书签区块，文件右键加入/取消，删除文件自动清理 |
| 3.2 | 表格列宽拖拽 | ✅ | v0.8.0 | `columnResizingPlugin`（已引入），当次会话内有效（markdown 不携带列宽，无法跨会话持久化） |
| 3.8 | 拼写检查开关 | ✅ | v0.8.4 | `settings.ts` spellcheck 字段（默认关闭），Editor root div 绑定 spellCheck，ProseMirror contentEditable 继承，运行时切换 |
| 3.3 | 单文件模式 | ✅ | v0.8.4 | `workspaceMode`（folder/file/null）+ `openFileStandalone`，不建文件树但设 rootPath 为父目录便于图片相对路径解析，支持散落多 md 作为标签页 |
| 3.3 | 多面板分屏 | ✅ | v0.9.0 | workspace store 新增 `splitFile`/`splitContent` 及 `splitOpen`/`splitClose`/`splitSwap`/`setSplitContent`；标签页右键「在分屏打开」启动右侧第二面板，双编辑器实例独立编辑，支持左右交换 |
| 3.1 | 拖拽块排序 | ✅ | v0.9.0 | `block-drag.ts` ProseMirror 插件，顶层块左侧 ⋮⋮ 手柄（Decoration.widget），HTML5 DnD 整块移动，drop 指示器高亮目标位置 |
| 3.4 | 导出长图（PNG） | ✅ | v0.9.0 | `exporter.ts` `exportPNG`，html2canvas 离屏渲染编辑器内容为 2x PNG，桌面端写文件/浏览器端下载 |
| 3.4 | 文档大纲导出 | ✅ | v0.9.0 | `exporter.ts` `exportOutline`，基于 `parseOutline` 提取标题层级，生成带缩进列表 + 原始标题结构的 md 文件 |
| 3.3 | 多窗口 | ✅ | v0.9.0 | `newWindow.ts` 用 `WebviewWindow` 创建独立窗口，文件路径经 URL 查询参数传递，新窗口启动时自动 `openFileStandalone`；文件树/标签页右键「在新窗口打开」 |
| 3.1 | 多光标/块选 | ❌ | — | 调研后不做：ProseMirror 作者确认 Sublime 式多光标「very hard」，需自定义 Selection 子类 + 重写输入处理，无现成实现；现有多范围选择仅表格 CellSelection（已支持）。详见 9.3 |
| 3.7 | 内置图床 | ❌ | — | 调研后 defer：需后端存储（S3/OSS）或第三方云服务账号，与本地优先/绿色理念冲突且引入安全与依赖。现有 `image-upload.ts` 本地 assets 方案为推荐工作流，详见 9.3 |
| — | 品牌重命名 | ✅ | v1.0.0 | Inkling → InklingMD（productName/窗口标题/README/Cargo 包名等用户可见处），规避与 Inkling Systems 公司重名；localStorage key 等内部标识符保留不动避免丢用户数据 |
| — | 开源化 | ✅ | v1.0.0 | MIT 许可证、CONTRIBUTING.md 贡献指南、issue/PR 模板、README 徽章与贡献者章节 |
| 9.1 | 中文句号字形修复 | ✅ | v1.0.0 | issue #9：`index.html` `lang="zh-CN"` + 全局字体栈增加简体中文字体（Noto Sans CJK SC / Microsoft YaHei / PingFang SC），修复 Linux 下 U+3002 回退到 CJK JP 居中字形 |
| 3.2 | 本地图片相对路径 | ✅ | v1.0.0 | PR #8：`EditorProps` 增加 `filePath`，`imageUploadPlugin`/`imageView` 据此解析本地图片相对路径；切换文件由外层 `key` 触发编辑器重建刷新闭包 |
| 3.3 | 文件关联双击打开 | ✅ | v1.0.1 | 双击 .md 文件启动程序自动打开该文件；Rust 端 `md_file_from_args` 从 argv 提取路径存 `PendingFile` state，前端 `take_pending_file` 拉取（避免事件早于监听器注册丢失）；`tauri-plugin-single-instance` 单实例转发，程序已运行时双击不开新实例，`emit_to("main")` 定向到主窗口 |
| 3.3 | 新建未命名草稿 | ✅ | v1.1.0 | `Ctrl+N` 新建未关联磁盘文件的草稿 tab（`OpenTab.isUntitled`，虚拟路径 `untitled-N`）；`Ctrl+S` 弹另存为对话框选保存位置，保存后转为普通文件 tab 并加入最近列表；未命名草稿不自动保存（`useAutoSave` 跳过） |
| 3.8 | 插入工具栏 | ✅ | v1.1.0 | 工具栏从编辑器内部提升到标题栏下方固定非滚动行（修复 sticky 在 flex 滚动容器内失效导致下滑消失）；把斜杠菜单支持的块类型全部做成按钮（H1-3/列表/引用/代码块/分割线/表格/公式/Mermaid/提示框/目录/元数据），`block-commands.ts` 复用插入逻辑；表格内时显示行列增删/对齐上下文按钮 |
| 3.2 | 斜杠菜单表格可填写 | ✅ | v1.1.0 | 修复：slash-menu 手动构造 table_cell 时塞了 `schema.text(" ")`，但 cell contentSpec 是 block 级，结构非法导致无法编辑；改为 `schema.nodes.paragraph.create()` 空段落 |
| 3.2 | Mermaid 图表可编辑 | ✅ | v1.1.1 | `mermaid-view.ts` 加「编辑」按钮 + 双击入口，切 textarea 编辑源码，失焦/Ctrl+Enter 提交重新渲染；非编辑态 `stopEvent` 改为 `() => editing` 允许选中删除 |
| 3.2 | 块级/行内公式可编辑 | ✅ | v1.1.1 | `math.ts` createMathView 加双击内联编辑 LaTeX，失焦提交；编辑态 `stopEvent` 拦截事件防抢焦点 |
| 3.2 | 列表插入报错修复 | ✅ | v1.1.3 | 修复 `content does not fit in gap`：`bullet_list`/`ordered_list` 的 content 为 `list_item+`，wrap 时漏包 `list_item` 这一层导致 paragraph 直接进 list 违反 content 规范；斜杠菜单与工具栏均改为 `wrap(range, [list, list_item])` |
| 3.2 | 表格列宽调整报错修复 | ✅ | v1.1.1 | 修复 `invalid content for node table_row`：GFM 把 table_row 拆成 `table_header_row`（content `(table_header)*`）与 `table_row`（content `(table_cell)*`），斜杠菜单误把 table_header 塞进 table_row；改为第一行用 `table_header_row`，其余行用 `table_row` |
| 3.2 | 块插入位置修复 | ✅ | v1.1.1 | 修复分割线/表格/公式/callout/TOC 落在下一行：新增 `insertBlockAtCursor`/`insertBlockHere`，当前段落为空时直接替换，非空才插在当前块之后 |
| 3.2 | 列表/引用 wrap 修复 | ✅ | v1.1.1 | 修复 `content does not fit in gap`：合并到单个 transaction，用 `tr.selection` 算 blockRange，避免 deleteRange 后的 stale selection 问题 |
| 3.1 | Ctrl+A 全选全文 | ✅ | v1.1.1 | ProseMirror 默认 `Mod-a` 只选当前块文本；新增 `inkling-select-all` 插件拦截 Mod-a，用 `AllSelection` 选中整个文档 |
| 3.1 | 点击空白处可编辑 | ✅ | v1.1.1 | 监听编辑器根 mousedown，`posAtCoords` 返回 null（点击落在内容节点之外）时在文档末尾追加空段落并定位光标，无需手动换行。v1.1.4 修复：点击右侧 padding 区不再跳到文档最底部，改为把 x 夹到内容区内重查 `posAtCoords`，光标落在点击 y 对应的行附近；仅点击 y 超出所有内容时才追加末尾段落 |
| 3.3 | 新建草稿自动聚焦 | ✅ | v1.1.1 | `Ctrl+N` 新建未命名草稿后编辑器重建完成时自动 `view.focus()`，无需手动点击 |
| 3.8 | 块删除能力 | ✅ | v1.1.3 | 工具栏新增「删除块」按钮，`deleteCurrentBlock` 命令删除光标所在的整个顶层块（引用/代码块/Mermaid/提示框/元数据/列表/公式/TOC/分割线）；mermaid/frontmatter 的 `stopEvent` 优化为仅拦截编辑区内事件，非编辑态可点击选中后 Backspace 删除 |
| — | 应用图标更新 | ✅ | v1.1.2 | 用 `tauri icon` 命令从用户提供的源图重新生成全平台图标（Windows ico/StoreLogo、macOS icns、iOS、Android 全套） |
| 3.8 | 快捷键系统修复 | ✅ | v1.1.5 | 修复 `matchBinding` 的致命 bug：`MODIFIER_KEYS` 漏了 `"mod"`，导致 `parts.find` 把 `"mod"` 当作最终按键，`e.key === "mod"` 永远 false，所有走 shortcuts store 的快捷键（Ctrl+F/Ctrl+\/Ctrl+'/Ctrl+\/Ctrl+,）全部失效；加入 `"mod"` 后修复 |
| 3.8 | Ctrl+K 插入链接 | ✅ | v1.1.5 | Typora 标准快捷键：选中文本按 Ctrl+K 弹输入框填 URL，给选中文本加 link mark；无选中则先填 URL 再填文本，插入 `[文本](url)` |
| 3.8 | Ctrl+Alt+0 转普通段落 | ✅ | v1.1.5 | Typora 标准快捷键：清除当前块格式，标题/引用/代码块等转回普通段落 |
| 3.6 | Ctrl+滚轮缩放文档 | ✅ | v1.2.2 | `Ctrl/Cmd+滚轮` 等比放大/缩小整个文档（50%~300%，步进 10%），`Ctrl/Cmd+0` 重置 100%；缩放级别持久化到 localStorage；状态栏右侧显示当前百分比，点击可重置 |
| 3.2 其他 | HTML 嵌入/行内标签渲染 | ✅ | v1.2.3 | 白名单渲染 `<span>/<kbd>/<mark>/<details>/<blockquote>` 等标签；DOMParser 解析 + LRU 缓存保性能；过滤 script/on*/javascript: 等危险内容 |
| 3.2 其他 | 脚注（footnote） | ✅ | v1.2.3 | GFM 脚注语法 `[^1]` 引用 + `[^1]: 定义`；点击引用跳转定义，点击返回链接跳回首个引用 |
| 3.2 图表 | Mermaid 下载与缩放 | ✅ | v1.2.3 | 「下载」按钮导出 SVG 文件（桌面端弹保存对话框）；图表上 `Ctrl/Cmd+滚轮` 缩放 SVG（0.5~3x），不触发文档缩放 |
| 3.6 | Ctrl+滚轮缩放文档（性能修复） | ✅ | v1.2.4 | 修复万行 MD 文档滚轮失效：wheel 监听器改为仅在 Ctrl/Cmd 按下时挂载（passive:false），普通滚动时 window 上无任何 wheel 监听器走浏览器合成线程快速路径；逻辑抽到 `useCtrlWheelZoom` hook 便于测试 |
| 3.2 表格 | 表格删列/删行按钮修复 | ✅ | v1.2.4 | 修复工具栏「删列/删行」按钮无效（原依赖 CellSelection 但未先选中列）；改用 `prosemirror-tables` 的 `deleteColumn`/`deleteRow` 直接基于光标位置删除，无需先选列 |
| 3.2 图表 | Mermaid 图表拖动平移 | ✅ | v1.2.5 | 缩放大于 100% 时按住鼠标拖动平移图表查看各区域（无需调滚动条）；双击重置缩放与平移；重新渲染图表时重置平移；`destroy` 清理 window 监听器避免泄漏 |
| 3.3 公式 | 块级公式插入修复 | ✅ | v1.2.6 | 修复斜杠菜单和工具栏插入块级公式「不能用」：插入空 atom 节点后 KaTeX 渲染空字符串无可见内容；改为插入后自动选中节点并触发双击进入编辑模式，且空值显示虚线占位框「双击编辑公式」 |
| 3.4 工具栏 | 删除块/列表/引用多项边界 bug 修复 | ✅ | v1.2.7 | 修复5个 bug：①光标在元数据上点删除块误删底部块（NodeSelection 未识别）；②点击目录块再点删除块无反应（同上）；③工具栏点两次删除线报错 "there is no position after the top-level node"（insertBlockHere 在文档末尾块 $from.after 越界）；④点两次列表报错 "invalid content for node list_item"（列表内重复 wrap）；⑤代码块内点列表/引用报错 "content does not fit in gap"（code_block content 不允许 wrap） |
| 3.2 数学公式 | 行内公式插入入口 | ✅ | v1.2.8 | `insertInlineMath` 命令在光标处插入 `math_inline` atom 节点并自动进入编辑态；工具栏 `$ 行内` 按钮 + 斜杠菜单 `/行内` 双入口；空值显示「公式」占位提示 |
| 3.4 工具栏 | frontmatter 删除块误删彻底修复 | ✅ | v1.2.8 | v1.2.7 的 mousedown 监听被 CodeMirror focus 事务冲掉仍失效；`deleteCurrentBlock` 增加 DOM 焦点回退（`document.activeElement` 反查 atom 顶层块）；删除块按钮 `onMouseDown preventDefault` 防止抢走 CM 焦点 |
| 3.2 列表 | 列表内点代码块/表格/标题报错修复 | ✅ | v1.2.8 | 修复 `invalid content for node list_item`：list_item content 要求首子节点为 paragraph；新增 `exitListIfNeeded` 在列表后插入空段落移出光标，`setBlockType`/`insertTable` 调用前先退出列表 |
| 3.6 表格 | 列宽拖拽手柄不可见修复 | ✅ | v1.2.9 | `columnResizingPlugin` 装配正确但 `App.css` 把 `.column-resize-handle` 设为 `opacity:0` 且无 `:hover` 显形规则导致手柄永久不可见；补 `th/td:hover .column-resize-handle { opacity:0.5 }` 和拖拽中 `opacity:0.8`；`table overflow:hidden` 改 `visible` 避免裁掉最右列手柄 |
| 3.8 桌面端 | 全部替换/保存报错 `message not allowed by acl` 修复 | ✅ | v1.2.9 | Tauri v2 ACL 对自定义 command 强制校验，app command 不会自动生成权限标识符；新增 `permissions/app-commands.toml` 用 `[[permission]]` 块为 13 个 command 显式定义权限，`capabilities/default.json` 引用 `allow-write-text-file` 等，修复全部替换→自动保存→`write_text_file` 被拦截链路（同时修复打开文件/工作区/导出等所有 fs 功能） |
| 3.2 代码块 | 点击第一行光标跳到 9-11 行修复 | ✅ | v1.2.9 | `CodeBlockNodeView.setSelection` 直接把 PM 绝对位置当 CM 本地位置传给 `cm.dispatch`，`forwardUpdate` 反馈闭环导致光标跳到 `getPos()+1` 对应的 CM 本地位置（约第 10 行）；改为 `localAnchor = anchor - getPos() - 1` 做位置翻译（与 `forwardUpdate` 的 `offset = getPos()+1` 互逆）+ 边界夹紧；`selectNode` 清空 CM 选区；`update` 的 `scrollIntoView` 改 `false` 避免外部更新乱滚动 |
| 3.8 桌面端 | 全部替换 alert 报错 `dialog\|message not allowed acl` 修复 | ✅ | v1.2.10 | Tauri webview 自动拦截 `window.alert()` 映射为 `dialog.message`、`window.confirm()` 映射为 `dialog.ask`，但 capabilities 只授权了 `dialog:allow-open`/`dialog:allow-save` 缺 `dialog:allow-message`/`dialog:allow-ask`；补齐这两个权限，修复全项目 20 处 alert/confirm 调用的 ACL 拦截（全部替换、删除确认、重命名失败提示等） |
| 3.5 样式 | 设计令牌系统（design token） | ✅ | v2.0.0 | 全应用通过 CSS 变量统一管理品牌强调色（`--accent` 浅色 `#0969da` / 深色 `#2f81f7`，统一原先散落的近似值）、三级文字色阶、分层阴影（`--shadow-sm/md/lg`）、圆角梯度（`--radius-sm/md/lg`）、动效曲线（`--ease` / `--duration`）、键盘聚焦环（`--ring`）；主题切换只改一处 |
| 3.5 样式 | 统一 SVG 图标库 | ✅ | v2.0.0 | `icons.tsx` 线性风格（`stroke=currentColor` 随文字颜色继承），默认 16px / 24×24 viewBox，替代原先混用的 emoji / Unicode 符号，跨平台渲染一致；覆盖 18 个图标（Folder/File/FileText/Star/StarFilled/Sun/Moon/Maximize/PanelLeft/Settings/HelpCircle/X/ArrowLeftRight/ChevronDown/ChevronRight/Download/AlertTriangle/Palette） |
| 3.5 样式 | 现代化滚动条 / 聚焦环 / 动效 / 活跃状态 | ✅ | v2.0.0 | 细半透明滚动条（10px，hover 加深，标签页栏 3px）；`:focus-visible` 键盘聚焦环（鼠标点击不触发）；菜单弹入 `menu-in`（0.12s）、模态弹入 `modal-in`（0.18s）、遮罩淡入 `backdrop-in`、空状态淡入 `fade-in`；ghost 风格顶栏按钮；渐变品牌标题（`background-clip:text`）；活跃 tab 卡片样式（顶部强调色指示条 + 底部连通编辑区）；活跃文件左侧指示条（`inset box-shadow`）；iOS 风格 Toggle 开关；模态毛玻璃遮罩（`backdrop-filter:blur(2px)`）；文本选择色跟随强调色；全应用过渡曲线统一引用令牌 |
| 3.5 样式 | Mermaid 流程图多行节点文字底部裁切修复 | ✅ | v2.0.1 | 根因三因素叠加：`:root line-height:1.6` 继承进 mermaid `nodeLabel` 使渲染行高 ≈ 测量行高（~1.2）1.33 倍、`flowchart.useMaxWidth` 默认 true 触发长文本回流高度重算偏差、`style stroke-width:2px` 加粗边框侵占内部高度；修复：`mermaid-view.ts` 提取 `MERMAID_CONFIG`（`flowchart.htmlLabels:true` + `padding:20` + `useMaxWidth:false` + `themeVariables.fontSize:"14px"`），`App.css` 锁定 `.mermaid`/`.mermaid-render` 的 `.nodeLabel`/`.edgeLabel` `line-height:1.25` + `font-size:14px` + 字体，使测量阶段与渲染阶段文字高度一致 |
| 3.3 工作区 | 大型工作区按需加载与文件树渲染优化 | ✅ | v2.1.0 | issue #11/PR #15：Rust `list_dir` 改为单层浅扫并迁入 `spawn_blocking` 线程池避免阻塞 Tauri 异步运行时，跳过隐藏项/依赖构建目录（node_modules、target、dist、build、out）/目录符号链接；前端目录树按需逐层加载（默认只展开根目录）、大目录窗口化渲染；工作区切换竞态、目录请求去重、局部刷新保留已加载子树；新增 `src/lib/fileTree.ts` |
| 3.5 样式 | 原生控件跟随主题配色 | ✅ | v2.1.0 | issue #14/PR #16：为浅色/深色主题及代码块 `data-code-theme` 补 `color-scheme` CSS 属性，使下拉框/滚动条等原生控件跟随主题（修复 Linux 上原生控件不随主题切换） |
| 3.3 工作区 | 打开文件时保留侧边栏文件树 | ✅ | v2.1.0 | issue #12/PR #17：不再用全局加载态替换文件树，改为行内 spinner/错误图标局部提示并保留文件树 DOM 与滚动位置；文件读取去重、标签页/分屏/工作区上下文竞态处理，读取失败保留编辑器并允许重试 |
| — | Release 增加 Linux amd64 构建 | ✅ | v2.1.0 | issue #13/PR #18：CI 由 `build-windows.yml` 整合为统一 `build.yml`（共享 test + build-windows + build-linux + 独立 release job），`v*` tag 同一 Release 同时发布 Windows 安装包/便携包与 amd64 AppImage + deb |
| 3.2 编辑 | 源代码模式（整页 Markdown 源码编辑） | ✅ | v2.2.0 | issue #19：`SourceModeEditor.tsx` CodeMirror 6 + GFM 高亮 + 行号；顶栏按钮 + `Ctrl/Cmd+Alt+S` 可自定义；按标签页记忆；与专注/打字机互斥；WYSIWYG 隐藏不卸载 |
| 3.2 编辑 | 源码模式查找替换 | ✅ | v2.3.0 | issue #29：`Ctrl/Cmd+F` / `Ctrl/Cmd+R` 在源码模式路由到 CM 内置查找/替换面板（`@codemirror/search`），替换框内建在面板中 |
| 3.2 编辑 | 源代码模式光标/滚动映射增强 | ✅ | v2.3.0 | issue #26：`markdownOffsetToProsePos` 按源行权重（围栏代码块内部折权、空行归零）映射到 PM 位置，`prosePosToMarkdownOffset` 增加光标行片段匹配回退 |
| 3.2 编辑 | Markdown 往返保真单测 | ✅ | v2.3.0 | issue #25：无头 Milkdown（同款 schema/remark 插件）驱动 parserCtx/serializerCtx，覆盖 callout/frontmatter/mermaid/math/toc/混合文档/GFM 基线共 9 用例；顺带发现并修复 toc 节点序列化静默丢失 `[TOC]` 的真 bug |
| 3.2 编辑 | 退出源码模式重置撤销历史 | ✅ | v2.3.0 | issue #27：re-parse 整文档替换后灌入 history 插件初始空状态，避免 Ctrl+Z 退回与当前 markdown 不一致的旧文档 |
| 3.2 编辑 | 源码模式可访问性 | ✅ | v2.3.0 | issue #28：源码编辑区补 `role="textbox"` / `aria-multiline` / `aria-label` 等 ARIA 属性 |
| 3.6 辅助写作 | 打开文件不再误判 dirty | ✅ | v2.3.0 | `markdown-publisher` 以「解析后 doc 的序列化结果」为同步基线而非原始文件内容，消除序列化规范化差异导致的误脏、关闭 tab 误弹未保存确认 |
| 3.3 工作区 | 多标签滚动/光标位置防串扰 | ✅ | v2.3.0 | issue #30/PR #35（@TomGoh）：滚动/光标位置按文件路径读写，切 tab 不再互相串扰 |
| 3.3 工作区 | 自动保存链路稳健性 | ✅ | v2.3.0 | PR #34：保存路径 flush 跳过 idle 编辑器、防抖窗口内编辑到点先 flush 落盘、异步发布绑定文件路径修复 tab 切换串写、关闭/swap 路径先 flush、dirty 状态镜像同步 |
| 3.6 辅助写作 | macOS E2E 平台按键兼容 | ✅ | v2.3.0 | issue #36/PR #37（@TomGoh）：光标到文档首/尾的 E2E 按键在 macOS 上改用 `Cmd+↑/↓` |
| — | CI 测试增加 Linux runner | ✅ | v2.3.0 | `test` job 改为 windows-latest + ubuntu-latest 矩阵，Linux 下单独 `sudo` 装 Playwright 系统依赖 |
| 3.2 其他 | Mermaid 图表视口懒渲染 | ✅ | v2.3.1 | 打开万行多图文档不再同步渲染全部图表：IntersectionObserver（300px 预载边距）延迟到进入视口才渲染，视口外保留占位容器；打开时长任务 ~7s → ~2s，滚动最长单任务 2s+ → 179ms |
| 3.2 其他 | Mermaid 空闲预渲染 | ✅ | v2.3.2 | 修复懒渲染把开销转移到滚动时的逐张卡顿：视口外图表按文档顺序排入队列，requestIdleCallback 每个空闲槽后台渲染一张，滚动停歇 250ms 内自动暂停；全文滚动 51 长任务/4.2s → 27/2.8s（90fps） |

### 8.2 发布版本

- **v2.3.2** 万行多图文档滚动掉帧修复：用户实测 v2.3.1 反馈打开已明显改善，但滚轮滚动仍掉帧，体感与 v2.2 相当、远不如 v2.1。Chrome DevTools trace 定位：滚动期强制回流大头全是 Mermaid 渲染内部（addHtmlSpan 933ms、sequenceDiagram drawText 257ms、insertEdge 150ms 等）——v2.3.1 的视口懒渲染把渲染开销从"打开时"转移到"滚动时"，滚到未渲染图表处逐张 ~150ms 卡顿；而 v2.1.0 打开时同步全量渲染（冻结 ~10s）后滚动反而全程顺滑。纯文本区滚动实测 0 长任务、getBoundingClientRect 仅 ~2 次/帧，证明 outline 自动跟随（v2.2 引入的滚动 posAtCoords 采样）与 cursor-saver（v2.3.0 引入的滚动落盘）开销均可忽略，非元凶。修复：`mermaid-view.ts` 新增空闲预渲染队列——打开文档后视口外图表按创建（文档）顺序排入模块级队列，`requestIdleCallback` 每个空闲槽渲染一张（每张 ~150ms 超出单帧预算，逐张让出主线程），document 级捕获滚动监听 + 停歇 250ms 内暂停预渲染避免与滚动争抢主线程，滚得快落在未预渲染图表时仍由视口即时渲染兜底，容器销毁（切文档）后队列任务自动跳过。实测：打开时长任务保持 ~1.9s 不变；打开后静止 16s 视口外图表 59/60 张后台渲染完成；全文滚动（0→末尾 3000px/350ms）长任务 51 个/4195ms → 27 个/2780ms（平均 90fps，剩余长任务为 170 个代码块 CodeMirror 懒挂载，v2.1.0 同样存在非回归）；快速滚动多图区仅 1 个长任务/50ms。全套单元/组件测试 367 passed。详见 `docs/v2.3.2 设计文档.md`
- **v2.3.1** 万行多图文档打开卡顿修复：用户对比 v2.1.0 反馈打开万行复杂文档（60 张 Mermaid 图 + 170 代码块 + 455 行内公式，398KB，约 1.8 万行）明显更卡。经 git worktree 双版本基准（核心引擎 parse ~750ms / serialize ~200ms 无差异）+ Chrome DevTools 长任务剖析定位：打字路径 v2.3.0 反而更优（publisher 防抖后 1 个 220ms 长任务 vs v2.1.0 的 68 个共 5.2s），真正瓶颈是 Mermaid 图表打开即同步渲染全部图表——每张 ~150ms 阻塞主线程，60 张合计 ~9s 长任务、期间滚动/输入全程冻结；此问题两版本共有，v2.3.0 因 publisher 基线序列化等叠加冻结窗口更长故体感更差。修复：`mermaid-view.ts` 图表改为 IntersectionObserver 视口懒渲染（300px 预载边距），视口外仅保留占位容器（与 v1.2.0 代码块懒挂载同模式），`update` 在进入视口前跳过渲染、`destroy` 断开观察；`mermaid-render/pan` 单测补 happy-dom 下 IO stub（`observe` 即进入视口，保持创建即渲染契约）。实测：打开时长任务 6.5~7.4s（49~51 个）→ 1.9s（4 个），打开时预渲染图表 60/60 → 0/60，全文滚动最长单任务 2s+ → 179ms，视口内图表正常渲染（滚动到位置即出图）。全套单元/组件测试 367 + E2E 138 passed。详见 `docs/v2.3.1 设计文档.md`
- **v2.3.0** 性能回退修复 + 源码模式增强 + 保存链路稳健性 + 社区修复：①issue #31 修复万行文档编辑/滚动掉帧（v2.2.0 性能回退，`markdown-publisher` 保存路径 flush 跳过 idle 编辑器，避免对每个挂载编辑器重复全文序列化）；②issue #29 源码模式查找替换——`Ctrl/Cmd+F` / `Ctrl/Cmd+R` 在源码模式路由到 CM 内置查找/替换面板（`@codemirror/search`，替换框内建在面板中），替代原先「提示退出源码模式」的 alert；③issue #26 光标/滚动映射增强——`markdownOffsetToProsePos` 按源行权重（围栏代码块内部行折权、空行归零）映射 PM 位置，`prosePosToMarkdownOffset` 增加光标行片段匹配回退；④issue #27 退出源码模式重置 PM 撤销历史——re-parse 整文档替换后灌入 history 插件初始空状态，避免 Ctrl+Z 退回与当前 markdown 不一致的旧文档；⑤issue #28 源码模式可访问性——`role="textbox"` / `aria-multiline` / `aria-label` 等 ARIA 属性；⑥打开文件不再误判 dirty——publisher 以「解析后 doc 的序列化结果」为同步基线，消除规范化差异导致的误脏、关闭 tab 误弹未保存确认；⑦issue #25 Markdown 往返保真单测——无头 Milkdown 驱动真实 parser/serializer 覆盖 callout/frontmatter/mermaid/math/toc 等自定义块，并据此修复 toc 节点序列化静默丢失 `[TOC]` 的真 bug；⑧PR #34 保存链路——异步发布绑定文件路径修复 tab 切换串写、防抖窗口内编辑到点先 flush 落盘、手动保存/关闭/swap 路径先 flush、dirty 状态镜像同步；⑨issue #30/PR #35（@TomGoh）多标签滚动/光标位置按文件路径读写防串扰；⑩issue #36/PR #37（@TomGoh）macOS E2E 平台按键兼容；⑪CI `test` job 改为 windows-latest + ubuntu-latest 矩阵，Linux 下单独 `sudo` 装 Playwright 系统依赖。单元/组件测试 367 + E2E 138 passed。详见 `docs/v2.3.0 设计文档.md`
- **v2.2.0** 新增源代码模式（issue #19）：整页切换为 CodeMirror 6 编辑原始 Markdown（GFM 语法高亮 + 行号，主题/缩放与 WYSIWYG 一致）；顶栏 `</>` 按钮 + 默认 `Ctrl/Cmd+Alt+S` 快捷键（可在快捷键面板自定义）；按标签页独立记忆模式；进入时自动关闭专注/打字机模式；退出时 re-parse 回 ProseMirror；分屏面板独立切换；富文本导出/查找替换在源码模式下提示退出后再用。新增 `SourceModeEditor.tsx`、`codemirror-shared.ts`、`source-mode-cursor.ts` 及 E2E/单元测试。详见 `docs/v2.2.0 设计文档.md`
- **v2.1.0** 合并社区贡献者 @TomGoh 的三项工作区/主题修复并新增 Linux 发行版：①issue #11/PR #15 大型工作区按需加载与文件树渲染——Rust `list_dir` 改为单层浅扫并迁入 `spawn_blocking` 线程池避免阻塞 Tauri 异步运行时，跳过隐藏项/依赖构建目录/目录符号链接，前端按需逐层加载 + 大目录窗口化渲染 + 工作区切换竞态/目录请求去重/局部刷新保留已加载子树，新增 `src/lib/fileTree.ts`；②issue #14/PR #16 同步原生控件与主题配色——为浅色/深色主题及代码块 `data-code-theme` 补 `color-scheme`，使原生控件跟随主题（修复 Linux 上原生控件不随主题切换）；③issue #12/PR #17 打开文件时保留侧边栏文件树——行内 spinner/错误图标局部提示并保留 DOM 与滚动位置，文件读取去重、标签页/分屏/工作区上下文竞态处理、读取失败保留编辑器可重试；④issue #13/PR #18 Release 增加 Linux amd64 构建——CI 整合为统一 `build.yml`（共享 test + build-windows + build-linux + 独立 release job），`v*` tag 同一 Release 同时发布 Windows 安装包/便携包与 amd64 AppImage + deb。单元/组件测试 299 passed。详见 `docs/v2.1.0 设计文档.md`
- **v2.0.2** 补全 E2E 测试覆盖并修复测试驱动发现的三个生产 bug：①`auto-pair.ts` 无选区配对补全崩溃（`view.state.doc.resolve` 应为 `tr.doc.resolve`，Selection 指向旧文档触发 `RangeError`，输入任意括号即白屏）；②`callout.ts` 解析器不兼容 Obsidian 常见写法 `> [!NOTE]\n> 内容`（正则 `^\[!(\w+)\]$` 要求首段完全等于 `[!TYPE]`，改为 `^\[!(\w+)\]` 开头即匹配，后续文本作为内容保留）；③`frontmatter.ts` NodeView 漏设 `data-value` 属性。新增 8 个 E2E 测试文件 67 个用例（auto-pair/callout/editor-modes/frontmatter/link-follow/math/shortcuts-customize/toc），修复 4 个既有 flaky 测试，`fs.ts` mock 增强。全套 262 单元 + 127 E2E 测试通过。详见 `docs/v2.0.2 设计文档.md`
- **v2.0.1** 修复 Mermaid 流程图多行节点文字底部被边框裁切：渲染含 `<br/>` 多行 + 长中文文本 + `style stroke-width:2px` 加粗边框的纵向流程图时，多个矩形节点文字下沉、最后一行被 rect 底边遮挡，单行菱形判断框正常。根因为三因素叠加——①`:root line-height:1.6` 被 CSS 继承进 mermaid `nodeLabel`，使实际渲染行高 ≈ mermaid 测量行高（~1.2）的 1.33 倍，多行文字溢出底边；②`flowchart.useMaxWidth` 默认 true，长文本回流触发高度重算偏差；③`stroke-width:2px` 加粗边框向内侵占内部高度。修复：①`mermaid-view.ts` 提取 `MERMAID_CONFIG` 常量，补 `flowchart.htmlLabels:true`（保留 `<br/>` 换行）、`padding:20`（默认 15，加大内边距补偿）、`useMaxWidth:false`（关闭宽度回流）、`themeVariables.fontSize:"14px"`（锁定字号）；②`App.css` 新增 `.mermaid .nodeLabel/.edgeLabel` 与 `.mermaid-render .nodeLabel/.edgeLabel` 样式，同时作用于 mermaid 测量阶段（临时 `.mermaid` 容器）与最终渲染阶段，锁定 `line-height:1.25` + `font-size:14px` + 字体，使两阶段文字高度一致。新增 9 个测试用例（`tests/unit/mermaid-render.test.ts`，含用户报告原始流程图代码作回归 fixture），全套 262 个测试通过。详见 `docs/v2.0.1 设计文档.md`
- **v2.0.0** UI 视觉与交互体验全面优化：①建立设计令牌（design token）系统——全应用通过 CSS 变量统一管理品牌强调色（`--accent` 浅色 `#0969da` / 深色 `#2f81f7`，统一原先散落的近似值）、三级文字色阶、分层阴影（`--shadow-sm/md/lg` 替代生硬单层阴影）、圆角梯度（`--radius-sm/md/lg`）、动效曲线（`--ease` / `--duration`）、键盘聚焦环（`--ring`），主题切换只改一处；②统一 SVG 图标库（`icons.tsx`，线性 `stroke=currentColor` 随文字颜色继承，默认 16px / 24×24 viewBox，替代原先混用的 emoji / Unicode 符号，跨平台渲染一致）；③现代化滚动条（10px 细半透明滑块 + 透明轨道 + 内缩 `background-clip`，hover 加深，标签页栏收窄至 3px）；④`:focus-visible` 键盘聚焦环（Tab 键触发蓝环，鼠标点击不干扰）；⑤菜单 / 模态弹入动效（`menu-in` 上移缩放淡入 0.12s、`modal-in` 上浮缩放淡入 0.18s、`backdrop-in` 遮罩淡入、`fade-in` 空状态淡入）；⑥ghost 风格顶栏按钮（无边框、hover 灰底，VSCode / Typora 式）；⑦渐变品牌标题（`background-clip: text` 实现正文色到强调色 135° 渐变）；⑧活跃 tab 卡片样式（顶部 2px 强调色指示条 + 底部连通编辑区 + 关闭按钮 hover 显现）；⑨活跃文件左侧指示条（`box-shadow: inset 2px 0 0`）；⑩iOS 风格 Toggle 开关（`appearance:none` 自定义胶囊轨道 + 圆形滑块，`:checked` 强调色 + 右移过渡）；⑪模态毛玻璃遮罩（`backdrop-filter: blur(2px)`）；⑫文本选择色跟随强调色；⑬全应用过渡曲线统一引用令牌。纯样式重构，编辑器逻辑与功能不变。详见 `docs/v2.0.0 设计文档.md`
- **v1.2.10** 修复全部替换 alert 报错：Tauri webview 自动拦截 `window.alert()` 映射为 `dialog.message` command、`window.confirm()` 映射为 `dialog.ask`，但 `capabilities/default.json` 只授权了 `dialog:allow-open`/`dialog:allow-save` 缺 `dialog:allow-message`/`dialog:allow-ask`，导致全部替换后的 `alert('已替换 N 处')` 报 `command plugin: dialog|message not allowed acl`；补齐两个 dialog 权限修复全项目 20 处 alert/confirm 调用（全部替换、删除确认、重命名失败提示等）；新增 10 个测试用例（search.ts replaceAll/replaceCurrent 6 个 + capabilities 配置防回归 4 个），全套 253 个测试通过
- **v1.2.9** 三项回归修复：①表格列宽拖拽手柄不可见（`columnResizingPlugin` 装配正确但 `App.css` 把手柄 `opacity:0` 且无 `:hover` 显形规则导致永久不可见，补 hover 显形 + `table overflow` 改 `visible`）；②全部替换/保存报错 `message not allowed by acl`（Tauri v2 ACL 对自定义 command 强制校验，`capabilities/default.json` 缺 13 个 app command 权限，补齐 `allow-write-text-file` 等修复自动保存链路及所有 fs 功能）；③代码块点击第一行光标跳到 9-11 行（`CodeBlockNodeView.setSelection` 未做 PM 绝对位置→CM 本地位置翻译，`forwardUpdate` 反馈闭环导致光标跳到 `getPos()+1` 对应位置，改为 `anchor - getPos() - 1` + 边界夹紧，`selectNode` 清空选区，`update` 的 `scrollIntoView` 改 `false`）；新增 6 个 code-block-view 测试用例，全套 243 个测试通过
- **v1.2.8** 三项改进：①新增行内公式插入入口（`insertInlineMath` 命令在光标处插入 `math_inline` atom 节点并自动进入编辑态，工具栏 `$ 行内` 按钮 + 斜杠菜单 `/行内` 双入口，空值显示「公式」占位提示）；②彻底修复 frontmatter 删除块误删底部块（v1.2.7 的 mousedown 监听被 CodeMirror focus 事务冲掉仍失效，`deleteCurrentBlock` 增加 DOM 焦点回退路径——读 `document.activeElement` 反查所属 atom 顶层块，删除块按钮 `onMouseDown preventDefault` 防止抢走 CM 焦点）；③修复列表内点代码块/表格/标题按钮报错 `invalid content for node list_item`（list_item content 要求首子节点为 paragraph，新增 `exitListIfNeeded` 在列表后插入空段落移出光标，`setBlockType`/`insertTable` 调用前先退出列表，嵌套列表场景下新段落落到外层 list_item 的 block* 位置仍合法）；新增 7 个测试用例，全套 237 个测试通过
- **v1.2.7** 修复工具栏 5 个边界 bug：①光标在元数据（frontmatter）上点「删除块」误删文档底部块（原 `$head.before(1)` 在 atom 节点 NodeSelection 上返回错误位置，改为优先识别 NodeSelection 直接拿选中节点）；②点击目录块（toc）再点「删除块」无反应（同上，toc 是 atom 节点）；③工具栏点两次删除线（hr）报错 `there is no position after the top-level node`（`insertBlockHere` 在文档最后一个块调用 `$from.after()` 越界，改用 try/catch + 夹值到文档末尾）；④点两次有序/无序列表报错 `invalid content for node list_item`（列表内重复 wrap 产生非法嵌套，改为检测 `range.parent` 已是 list_item 时跳过）；⑤代码块内点列表/引用报错 `content does not fit in gap`（code_block content 是 `text*` 不允许被 wrap，改为检测 code_block 和 atom 节点时跳过，并加 try/catch 兜底）；新增 14 个 block-commands 测试用例覆盖上述场景，全套 230 个测试通过
- **v1.2.6** 修复块级公式插入「不能用」：斜杠菜单 `/公式` 和工具栏「∑ 公式」插入空 `math_display` atom 节点后，KaTeX 渲染空字符串无可视内容，用户以为没插入；改为插入后自动 `NodeSelection` 选中节点并通过 `dblclick` 事件触发 NodeView 编辑模式（直接弹出 textarea 输入），空值时显示虚线占位框「双击编辑公式」；新增 6 个 block-commands 测试用例，全套 216 个测试通过
- **v1.2.5** 新增 Mermaid 图表拖动平移：缩放大于 100% 时按住鼠标拖动图表查看各区域（放大后无需调横向/纵向滚动条），双击重置缩放与平移，重新渲染图表时重置平移，`destroy` 钩子清理 window 监听器避免泄漏；新增 11 个测试用例覆盖平移/缩放/双击重置/destroy 清理，全套 210 个测试通过
- **v1.2.4** 修复万行 MD 文档滚轮失效（Ctrl+滚轮的 passive:false 监听器常驻导致主线程被阻塞，改为仅在 Ctrl/Cmd 按下时动态挂载/卸载，普通滚动走浏览器合成线程快速路径；逻辑抽到 `useCtrlWheelZoom` hook）；修复工具栏表格「删列/删行」按钮无效（原依赖 CellSelection 未先选中列，改用 `prosemirror-tables` 的 `deleteColumn`/`deleteRow` 基于光标位置直接删除）；新增 24 个测试用例覆盖上述修复（scroll-performance 15 个 + TableToolbar 9 个），全套 199 个测试通过
- **v1.2.3** 新增 HTML 嵌入/行内标签渲染（白名单 + DOMParser + LRU 缓存保性能，过滤 XSS）；新增脚注支持（GFM `[^1]` 语法，点击跳转）；Mermaid 图表新增下载按钮（导出 SVG）和 Ctrl+滚轮缩放（0.5~3x）；补充 mock 示例文件
- **v1.2.2** 新增 `Ctrl/Cmd+滚轮` 缩放文档（50%~300%，`Ctrl/Cmd+0` 重置 100%，状态栏显示百分比可点击重置，缩放级别持久化）；修复 GitHub Action 中 `actions/upload-artifact@v5` 仍声明 `node20` 导致的 Node.js 20 弃用警告（升级到 v7）
- **v1.2.1** 修复 GitHub Action E2E 测试全部失败（断言假设一启动就有 mock 文件树，实际浏览器版需先点击「打开文件夹」按钮加载 mock 工作区）；修复 Node.js 20 弃用警告（actions/checkout、pnpm/action-setup、actions/setup-node、actions/upload-artifact 从 v4 升级到 v5）
- **v1.2.0** 性能优化（插件回调加 `docChanged` 守卫消除每键全树遍历、cursor-saver 防抖落 store、TabsBar/useAutoSave 精准订阅、代码块 NodeView 视口懒挂载、查找面板输入防抖）；新增 Ctrl+R 替换快捷键（逐个/全部替换）；建立自动化测试体系（169 个用例：单元/store/组件/E2E 四层，GitHub Action 测试失败阻断构建）
- **v1.1.5** 修复快捷键系统致命 bug（`matchBinding` 的 `MODIFIER_KEYS` 漏了 `"mod"`，导致 Ctrl+F/Ctrl+\/Ctrl+'/Ctrl+\/Ctrl+, 全部失效）；新增 Ctrl+K 插入链接、Ctrl+Alt+0 转普通段落
- **v1.1.4** 修复点击文档右侧空白区会跳到文档最底部的问题：原逻辑在 `posAtCoords` 返回 null 时直接在文档末尾追加段落，现改为把 x 坐标夹到编辑器内容区内重查 `posAtCoords`，让光标落在点击 y 对应的行附近
- **v1.1.3** 修复无序/有序列表插入报错 `content does not fit in gap`（wrap 漏包 `list_item` 层）；工具栏新增「删除块」按钮统一删除引用/代码块/Mermaid/提示框/元数据等块；优化 mermaid/frontmatter 的 `stopEvent` 使非编辑态可选中删除
- **v1.1.2** 更换应用图标（`tauri icon` 重新生成全平台图标）
- **v1.1.1** 修复块插入位置（落在下一行）、列表/引用 wrap 报错、表格列宽调整报错（`invalid content for node table_row`）；Mermaid/公式支持双击编辑；Ctrl+A 全选；点击空白处可编辑；Ctrl+N 新建草稿自动聚焦
- **v1.1.0** 新建文件（Ctrl+N 未命名草稿 + Ctrl+S 另存为对话框，保存后才自动保存）、工具栏重构（提升到标题栏下方固定，斜杠菜单支持的块类型全部做成按钮）、修复斜杠菜单插入的表格无法填写
- **v0.1.0** 骨架与基础编辑（Milkdown 集成、文件树、保存、字数统计）
- **v0.2.0** 图片渲染与拖拽/粘贴上传、表格工具栏、代码块语法高亮、链接跟随
- **v0.3.0** 主题系统与明暗模式、导出 HTML/PDF、大纲面板、Mermaid 图表、KaTeX 公式
- **v0.4.0** 多标签页编辑（标签页切换、关闭确认、文件树已打开标记）
- **v0.5.0** 专注模式 / 打字机模式、查找替换（正则）、偏好设置面板、YAML Front Matter、脚注、`[TOC]` 目录自动生成、文件外部修改监听、快捷键体系与帮助面板、复制为富文本/Markdown
- **v0.6.0** 导出 Word（.docx，走 Pandoc）、应用级快捷键自定义面板（含冲突检测、一键恢复默认）
- **v0.7.0** 全局搜索（`Ctrl+Shift+F`）、斜杠菜单 `/`、callout 提示框、标签页右键菜单 + 拖拽重排、文件树重命名/删除/新建、最近打开文件列表、编辑位置记忆、编辑器错误边界（修复打开部分 md 文件白屏问题）
- **v0.8.0** 禅模式（F11）、文件夹折叠状态记忆、书签/收藏、自动配对补全、图片缩放/对齐、行内图片、表格列宽拖拽验证
- **v0.8.1** 修复打开 md 文件白屏（Editor 工厂 try/catch + 超时降级 + 全局错误捕获 + 侧边栏关闭后无法打开文件死锁）
- **v0.8.2** 定位并修复白屏根因：`remark-frontmatter` 缺少 `"yaml"` options 导致 `editor.create()` 抛 `Missing type in matter {}`，错误被 Milkdown React 集成层 `.catch(console.error)` 静默吞掉；同步加固降级检测（loading=false 后验证 editor 实例）
- **v0.8.3** 修复专注模式无效果：CSS 选择器层级写反（`.focus-mode .editor-scroll ...` 实际 DOM 是 `.editor-scroll > .md-editor-root.focus-mode > .ProseMirror`），改为 `.focus-mode .ProseMirror > *`
- **v0.8.4** 拼写检查开关（偏好设置）、单文件模式（打开散落 md 不绑定文件夹，可继续打开新 md 作为标签页）
- **v1.0.1** 修复文件关联：双击 .md 文件启动程序后自动打开该文件；新增单实例（程序已运行时双击不开新实例，转发文件路径到主窗口打开）
- **v1.0.0** 🎉 首个正式版。品牌重命名 Inkling → InklingMD 并开源（MIT 许可证 + 贡献指南 + issue/PR 模板）；修复中文句号字形（issue #9）、合并 PR #8 本地图片相对路径；侧边栏打开按钮改为图标样式
- **v0.9.0** 多面板分屏（标签页右键「在分屏打开」，双编辑器左右对照 + 交换）、拖拽块排序（⋮⋮ 手柄整块重排）、导出长图 PNG（html2canvas）、文档大纲导出、多窗口（文件/标签页右键「在新窗口打开」，Tauri WebviewWindow）；多光标/块选与内置图床经调研后 defer（见 9.3）

### 8.3 与初版技术方案建议的差异

- **代码高亮**：Shiki → CodeMirror 6。CodeMirror 可嵌入 Milkdown 代码块节点视图，做到代码块内可直接编辑 + 高亮，更符合 WYSIWYG。
- **样式方案**：Tailwind CSS → 纯 CSS + CSS 变量。项目体量不大，CSS 变量已足够支撑主题系统。
- **PDF 导出**：Pandoc → 浏览器打印。零安装、零外部依赖，对个人使用足够。Word 导出仍走 Pandoc（v0.6.0）。
- **前端框架**：React 18 → React 19（跟随生态升级）。
- **脚注方案**：原计划 remark-footnotes，实际改用 GFM 预设自带的 footnote schema（GFM 脚注语法），仅需自定义 NodeView 提供点击跳转交互，无需额外 remark 插件。
- **Word 导出**：通过 Rust command 调用本地 `pandoc` 二进制（`std::process::Command`），未引入 tauri-plugin-shell。未安装 pandoc 时返回明确错误，前端引导用户安装。

---

## 9. 后续迭代规划（v0.7.0+）

> 排除 AI 能力、Pandoc 相关导出、知识库能力（双链/反向链接/标签/图谱等）、命令面板、Minimap、字数目标、文献引用管理、Git 集成、文档历史版本后的剩余功能。

### 9.1 v0.7.0（P1，搜索 + 编辑体验 + 文件管理）— 已发布

| 功能 | 说明 | 状态 |
|---|---|---|
| 全局搜索 | `Ctrl+Shift+F` 跨工作区所有 `.md` 文件搜内容，列出匹配文件和行号，点击跳转 | ✅ |
| 斜杠菜单 `/` | 输入 `/` 弹出块类型菜单（标题/列表/代码块/表格/引用/分割线/公式/Mermaid 等），键盘上下选择回车插入 | ✅ |
| callout 提示框 | GFM 语法 `> [!WARNING]` / `[!NOTE]` / `[!TIP]` / `[!IMPORTANT]`，渲染成带图标和配色的提示框 | ✅ |
| 标签页右键菜单 + 拖拽重排 | 标签页右键弹出"关闭其他/关闭右侧/全部关闭/复制路径"；按住拖动调整顺序 | ✅ |
| 编辑位置记忆 | 关闭文件时存光标位置和滚动位置，重开自动恢复 | ✅ |
| 文件树重命名/删除/新建 | 侧边栏文件右键支持重命名、删除、新建文件/文件夹 | ✅ |
| 最近打开文件列表 | 侧边栏顶部显示最近 N 个文件，点击直达 | ✅ |
| 编辑器错误边界 | 渲染异常时降级 UI 而非白屏（修复 v0.4 打开部分 md 白屏问题） | ✅ |

### 9.2 v0.8.0（P2，内容呈现 + 布局专注）— 已发布

| 功能 | 说明 | 状态 |
|---|---|---|
| 自动配对补全 | 输入 `"` `(` `「` 等自动配对，光标放中间；中文引号/书名号支持；可在设置开关 | ✅ |
| 图片缩放/对齐 | 图片节点加 width/align 属性，点击拖拽缩放，右键设置对齐（左/中/右） | ✅ |
| 行内图片格式 | 图片支持行内模式，插入文字流中（而非独占一行） | ✅ |
| 表格列宽拖拽 | 拖拽表格列边界调整宽度，宽度信息持久化 | ✅（会话内有效，markdown 不携带列宽无法跨会话持久化） |
| 全屏/禅模式 | `F11` 隐藏所有 UI（侧边栏/大纲/标签页/状态栏/工具栏），纯编辑，`Esc` 退出 | ✅ |
| 书签/收藏 | 文件右键"加入书签"，侧边栏书签面板列出所有书签，点击跳转 | ✅ |
| 文件夹折叠状态记忆 | 记住侧边栏每个文件夹的展开/折叠状态，重开应用恢复 | ✅ |

### 9.3 v0.9.0（P3，复杂或小众功能）— 已发布

| 功能 | 说明 | 状态 |
|---|---|---|
| 多面板分屏 | 标签页右键「在分屏打开」启动右侧第二面板，双编辑器实例独立编辑，支持左右交换 | ✅ |
| 拖拽块排序 | 段落左侧出现 ⋮⋮ 手柄，按住拖动整段重排 | ✅ |
| 导出长图 | 整篇文档渲染成 PNG 长图，用 html2canvas 实现，方便分享到社交平台 | ✅ |
| 文档大纲导出 | 只导出标题层级，生成只含标题的 md 文件，当目录用 | ✅ |
| 多窗口 | 文件右键"在新窗口打开"，Tauri 多窗口，多显示器场景 | ✅ |
| ~~拼写检查~~ | ✅ v0.8.4 已实现：浏览器原生拼写检查（红波浪线 + 右键修正建议），偏好设置开关 | ✅ |

### 9.3.1 v1.2.0（性能优化 + 自动化测试）— 已发布

| 功能 | 说明 | 状态 |
|---|---|---|
| 插件回调守卫 | formula-numbering / block-drag / outline 等插件加 `docChanged` 守卫，消除纯光标移动时的全树遍历；formula-numbering 额外加 `hasMathDisplay` 短路，无公式节点直接返回 | ✅ |
| cursor-saver 防抖 | 光标位置本地缓存 + 300ms 防抖落 store，避免每次光标移动触发 TabsBar / useAutoSave 全局重渲染 | ✅ |
| 精准订阅 | TabsBar 改为订阅 `path\|dirty\|isUntitled` 字符串快照、useAutoSave 改为订阅「活跃 tab 是否未命名」布尔派生值，打字时 UI 不重渲染 | ✅ |
| 代码块懒挂载 | CodeMirror 实例延迟到代码块进入视口（IntersectionObserver，200px 预加载）时才创建 | ✅ |
| 查找面板防抖 | 查找词 120ms 防抖，连续输入只触发一次全文匹配 | ✅ |
| Ctrl+R 替换快捷键 | 打开查找替换面板并自动展开替换框；支持逐个替换（`replaceCurrent`）和全部替换（`replaceAll`，从后往前避免位置偏移） | ✅ |
| 自动化测试体系 | 169 个用例分四层：纯逻辑单测（stats/slugify/shortcuts/outline）、store 测试（ui/settings/shortcuts）、Tauri 纯函数（fs/newWindow）、组件测试（StatusBar/TabsBar/SearchPanel）、Playwright E2E（编辑器渲染/查找替换/快捷键全流程）；GitHub Action `test` job 阻断 `build` | ✅ |

**性能定位（与主流编辑器对比）**：
- 中小文档（千行内）：与 Typora 体感基本拉平，明显优于 MarkText（Muya + marked.js 全量 re-parse 架构）
- 长文档（万行级）：仍不及 Typora（自研增量渲染 + 懒布局），但输入延迟增长曲线比 MarkText 平缓（增量 transaction vs 全量 re-parse）
- 启动/内存：Tauri 外壳远优于 MarkText（Electron）
- 仍存在的架构限制：ProseMirror 全量 DOM 渲染（无虚拟滚动）；Milkdown `markdownUpdated` 每键全文序列化 O(N)；Mermaid/KaTeX 无渲染缓存

### 9.4 调研后 defer 的功能

> 以下功能在 v0.9.0 规划中经可行性调研后决定**不在本版实现**，记录结论供后续决策。

| 功能 | 调研结论 | 后续方向 |
|---|---|---|
| 多光标编辑 / 块选模式 | ProseMirror 作者 Marijn Haverbeke 明确表示 Sublime 式多光标「very hard」：需自定义 `Selection` 子类并完整重写输入处理逻辑，社区无现成实现。现有多范围选择仅表格的 `CellSelection`（已支持），矩形块选 Markdown 场景几乎用不到，ROI 极低 | 不做。如未来 Milkdown/ProseMirror 上游提供多光标能力再评估 |
| 内置图床 | 需后端对象存储（S3/OSS/COS）或第三方图床（sm.ms/GitHub Issues）账号与凭证管理，与本项目「本地优先、免账号、绿色免安装」理念冲突，且引入网络依赖与凭证安全风险。现有 `image-upload.ts` 已提供完善的本地方案：拖拽/粘贴图片自动存入工作区 `assets/` 并插入相对路径，整个工作区可随文件夹迁移 | defer。未来可作为可选插件接入，由用户自行配置图床凭证 |

### 9.5 不做的功能（已排除）

- AI 相关能力（润色/翻译/续写/对话）
- Pandoc 相关导出（ePub/RTF/OPML 等，已有 docx 导出）
- 知识库能力（双向链接、反向链接、关系图谱、标签系统、嵌入式笔记、每日笔记、模板系统、块引用）
- 命令面板（`Ctrl+P` 跳转文件/执行命令）
- Minimap 缩略图
- 字数目标 + 进度条、文件计数
- 文献引用管理（BibTeX/CSL）
- Git 版本集成
- 文档历史版本
