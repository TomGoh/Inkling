# Markdown 所见即所得编辑器 —— 产品需求文档（PRD）

> 对标产品：Typora
> 文档版本：v1.2.6
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

### 8.2 发布版本

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
