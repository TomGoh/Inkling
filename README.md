# InklingMD

一款「所见即所得」的本地 Markdown 编辑器，对标 Typora。基于 Tauri 2 + React 19 + Milkdown 构建，编辑与预览融为一体——无需左右分栏、无需切换模式，输入 Markdown 语法后立即渲染成富文本，底层保存的始终是标准 Markdown 纯文本。

[![Build Windows](https://github.com/zhkp/InklingMD/actions/workflows/build-windows.yml/badge.svg?branch=main)](https://github.com/zhkp/InklingMD/actions/workflows/build-windows.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## 功能特性

### 编辑器内核
- 实时所见即所得渲染（基于 Milkdown / ProseMirror）
- 支持标题、加粗、斜体、删除线、行内代码、引用块、分割线
- 有序/无序/任务列表，多级嵌套（Tab/Shift+Tab 缩进）
- GFM 表格，附表格工具栏（增删行列、对齐、快速插入）
- 围栏代码块 + 语法高亮（CodeMirror，覆盖主流语言，可切换主题）
- KaTeX 数学公式（行内 `$...$` 与块级 `$$...$$`，支持 mhchem 化学方程式、自动编号；工具栏 `$ 行内` / `∑ 公式` 按钮与斜杠菜单 `/行内` / `/公式` 可直接插入空公式节点并自动进入 LaTeX 编辑态，双击已有公式可重新编辑）
- Mermaid 图表（流程图、时序图、甘特图等），支持「下载」按钮导出 SVG、`Ctrl/Cmd+滚轮`缩放图表（0.5~3x），放大后可按住鼠标拖动平移查看各区域，双击重置缩放与平移
- **HTML 嵌入**：白名单渲染 `<span style="color:red">`、`<kbd>`、`<mark>`、`<details>`、`<blockquote>` 等 HTML 标签，过滤 script/on*/javascript: 等危险内容
- **YAML Front Matter**：文档首部 `---` 围栏块，内嵌 CodeMirror 编辑 YAML
- **脚注**：标准 GFM 脚注语法 `[^1]` 与 `[^1]: 内容`，点击互相跳转
- **`[TOC]` 目录**：在文档任意位置写 `[TOC]`，自动根据标题生成目录树，点击跳转
- **callout 提示框**：支持 `> [!NOTE/WARNING/TIP/IMPORTANT]` 等 GFM 提示框语法，带图标配色
- **斜杠菜单**：空行输入 `/` 弹出块类型选择菜单，键盘导航 + 模糊过滤
- **自动配对补全**：输入括号 / 引号自动配对，光标置中；选中文字输入符号则包裹（含中文引号 / 书名号，可在设置开关）
- **图片缩放 / 对齐**：图片右下角拖拽缩放，右键设置对齐（左/中/右），属性编码进 markdown title 持久化
- **行内图片**：图片在文字流中行内显示
- **拖拽块排序**：每个顶层块左侧悬停出现 ⋮⋮ 手柄，按住拖动整块重排，drop 指示器高亮目标位置

### 文件与工作区
- **多标签页编辑**：同时打开多个 `.md` 文件，标签页切换，未保存提示与关闭确认
- **标签页右键菜单 + 拖拽重排**：关闭/关闭其他/关闭右侧/全部关闭/复制路径/在分屏打开/在新窗口打开，拖拽调整顺序
- **多面板分屏**：标签页右键「在分屏打开」启动右侧第二面板，双编辑器实例独立编辑两个文件，支持左右交换（多窗口对照编辑场景）
- **多窗口**：文件树或标签页右键「在新窗口打开」，Tauri 多窗口在独立窗口打开文件（多显示器场景）
- 文件树侧边栏：以文件夹为单位打开工作区（`Ctrl/Cmd+\` 切换显隐）
- **单文件模式**：「打开文件」直接打开散落在不同文件夹的 `.md`，不绑定工作区，多个文件作为标签页并存
- **文件树操作**：右键重命名、删除、新建文件/文件夹（含未保存提示与确认）
- **最近打开文件列表**：侧边栏顶部列出最近 10 个文件，点击直达（重启保留）
- **编辑位置记忆**：关闭文件时记住光标与滚动位置，重新打开时恢复
- **文件夹折叠状态记忆**：记住侧边栏每个文件夹的展开/折叠状态，重启恢复
- **书签 / 收藏**：文件右键加入书签，侧边栏书签区块列出所有书签，点击跳转（重启保留）
- **大纲面板**：根据标题生成目录树，点击跳转，当前标题自动高亮（`Ctrl/Cmd+'` 切换显隐）
- 自动保存（防抖 2 秒）+ `Ctrl/Cmd+S` 手动保存
- **外部修改监听**：检测到磁盘文件被其它程序修改时提示重新加载
- 图片拖拽 / 粘贴自动保存到当前 Markdown 文件同目录的 `assets` 目录
- 链接跟随：`Ctrl/Cmd+点击` 打开链接

### 搜索
- **查找替换**（当前文件）：支持正则表达式、区分大小写、上一个/下一个导航
- **全局搜索**：跨工作区所有 `.md` 文件搜索（`Ctrl/Cmd+Shift+F`），按文件分组展示命中，点击跳转到对应行

### 导出与复制
- 导出 HTML（含内嵌样式）
- 导出 PDF（调用浏览器打印）
- **导出 Word（.docx）**：通过本地 Pandoc 转换，未安装时给出引导提示
- **导出长图（PNG）**：用 html2canvas 把整篇文档渲染成 2x 高清 PNG 长图，方便分享到社交平台
- **导出大纲**：只导出标题层级，生成带缩进列表 + 原始标题结构的 md 文件，当目录用
- 复制为富文本（粘贴到其它软件保留样式）
- 复制为纯 Markdown 源码

### 样式与主题
- 明暗模式切换
- 支持加载自定义 CSS 覆盖样式（CSS 变量）
- 代码块语法高亮主题独立可配置（One Dark / 浅色 / 无高亮）
- **设计令牌系统**：全应用通过 CSS 变量统一管理配色 / 阴影 / 圆角 / 动效曲线，主题切换与调色只改一处
- **统一 SVG 图标库**：线性风格（`stroke = currentColor`），随文字颜色继承，跨平台渲染一致
- **现代化交互细节**：细半透明滚动条、`:focus-visible` 键盘聚焦环、菜单 / 模态弹入动效、ghost 风格顶栏按钮、活跃 tab 卡片样式 + 强调色指示条、活跃文件左侧指示条、iOS 风格 Toggle 开关、模态毛玻璃遮罩、渐变品牌标题

### 辅助写作
- 状态栏字数 / 字符数 / 行数 / 预计阅读时长统计
- **文档缩放**：`Ctrl/Cmd+滚轮` 等比放大/缩小整个文档（50%~300%），`Ctrl/Cmd+0` 重置 100%，状态栏显示当前百分比可点击重置，缩放级别跨会话持久化
- **专注模式**：弱化非当前段落，聚焦当前内容
- **打字机模式**：当前编辑行始终保持在视窗垂直居中
- **禅模式**：`F11` 隐藏所有 UI（侧边栏/大纲/标签页/工具栏/状态栏），纯编辑，`Esc` 退出
- **拼写检查**：浏览器原生拼写检查（红波浪线 + 右键修正建议），偏好设置开关（默认关闭）
- **偏好设置面板**：集中开关各项编辑器行为（`Ctrl/Cmd+,` 打开）
- **错误边界**：编辑器渲染异常时显示降级 UI 而非白屏，内容不丢失

### 性能优化
- **插件回调守卫**：formula-numbering / block-drag / outline 等插件加 `docChanged` 守卫，消除纯光标移动时的全树遍历
- **cursor-saver 防抖**：光标位置本地缓存 + 300ms 防抖落 store，避免每次移动触发 TabsBar / useAutoSave 全局重渲染
- **精准订阅**：TabsBar / useAutoSave 改为订阅派生快照，打字时 UI 不重渲染
- **代码块懒挂载**：CodeMirror 实例延迟到代码块进入视口（200px 预加载）时才创建，大量代码块文档首屏开销显著下降
- **查找面板防抖**：查找词 120ms 防抖，连续输入只触发一次全文匹配
- **滚轮监听器按需挂载**：`Ctrl/Cmd+滚轮` 缩放的 `passive:false` 监听器仅在 Ctrl/Cmd 按下时挂载，普通滚动时 window 上无任何 wheel 监听器走浏览器合成线程快速路径，修复万行文档滚轮失效问题（`useCtrlWheelZoom` hook）

### 快捷键体系
- 完整覆盖 Markdown 编辑常用快捷键（加粗、斜体、标题、列表、代码块等）
- 应用级快捷键：切换侧边栏、切换大纲、查找替换、偏好设置、快捷键帮助
- 按 `Ctrl/Cmd+/` 弹出快捷键帮助面板，集中查阅所有快捷键
- **快捷键自定义**：在帮助面板点击「自定义…」即可重新绑定应用级快捷键（含冲突检测、一键恢复默认）

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
│   ├── Editor/        # Milkdown 编辑器封装及插件（代码块、数学、Mermaid、图片、链接、表格、脚注、TOC、Front Matter、查找替换、专注模式、斜杠菜单、callout、错误边界等）
│   ├── GlobalSearch/  # 全局搜索面板
│   ├── Sidebar/       # 文件树侧边栏（含重命名/删除/新建、最近文件）
│   ├── Tabs/          # 多标签页栏（含右键菜单、拖拽重排）
│   ├── Outline/       # 大纲面板（标题跳转、当前高亮）
│   ├── Settings/      # 偏好设置面板
│   ├── Shortcuts/     # 快捷键帮助与自定义面板
│   └── StatusBar/     # 字数统计状态栏
├── lib/               # 文件读写、导出、大纲解析、字数统计、自动保存、文件监听、全局搜索封装
├── store/             # Zustand store（workspace / theme / settings / ui / shortcuts）
└── App.tsx
src-tauri/             # Rust 后端（Tauri 配置、文件系统命令、全局搜索命令、Pandoc 导出）
```

## 快捷键

按 `Ctrl/Cmd+/` 可在应用内随时查阅完整快捷键列表。常用快捷键：

| 快捷键 | 功能 |
|---|---|
| `Ctrl/Cmd+B` | 加粗 |
| `Ctrl/Cmd+I` | 斜体 |
| `Ctrl/Cmd+E` | 行内代码 |
| `Ctrl/Cmd+Alt+1 … 6` | 转为 H1 ~ H6 |
| `Ctrl/Cmd+Alt+C` | 代码块 |
| `Ctrl/Cmd+Alt+7 / 8` | 有序列表 / 无序列表 |
| `Ctrl/Cmd+Shift+B` | 引用块 |
| `Tab / Shift+Tab` | 缩进 / 提升列表项 |
| `Ctrl/Cmd+S` | 保存 |
| `Ctrl/Cmd+F` | 查找（当前文件） |
| `Ctrl/Cmd+R` | 替换（当前文件，自动展开替换框） |
| `Ctrl/Cmd+Shift+F` | 全局搜索（工作区所有文件） |
| `Ctrl/Cmd+\` | 切换侧边栏 |
| `Ctrl/Cmd+'` | 切换大纲面板 |
| `Ctrl/Cmd+,` | 偏好设置 |
| `Ctrl/Cmd+/` | 快捷键帮助 |
| `Ctrl/Cmd+滚轮` | 放大 / 缩小文档（50% ~ 300%） |
| `Ctrl/Cmd+0` | 重置缩放到 100% |
| `F11` | 禅模式（隐藏所有 UI） |
| `Esc` | 退出禅模式 |

> macOS 上 `Ctrl/Cmd` 对应 `⌘ Command`，`Alt` 对应 `⌥ Option`。

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

# 运行单元 + 组件测试（Vitest）
pnpm test

# 运行 E2E 测试（Playwright，首次需先 pnpm e2e:install 装 chromium）
pnpm e2e
```

> 浏览器 `pnpm dev` 模式下会使用 mock 工作区，方便脱离 Tauri 环境调试 UI。
> GitHub Action 每次 push/tag 会自动跑全部测试，测试失败阻断构建。

## 版本记录

- **v2.0.2** 补全 E2E 测试覆盖并修复测试驱动发现的三个生产 bug：①[auto-pair.ts](src/components/Editor/auto-pair.ts) 无选区配对补全崩溃（`view.state.doc.resolve` 应为 `tr.doc.resolve`，Selection 指向旧文档触发 `RangeError`，输入任意括号即白屏）；②[callout.ts](src/components/Editor/callout.ts) 解析器不兼容 Obsidian 常见写法 `> [!NOTE]\n> 内容`（正则 `^\[!(\w+)\]$` 要求首段完全等于 `[!TYPE]`，改为 `^\[!(\w+)\]` 开头即匹配，后续文本作为内容保留）；③[frontmatter.ts](src/components/Editor/frontmatter.ts) NodeView 漏设 `data-value` 属性（toDOM 声明了但 NodeView 自建 dom 时遗漏）。新增 8 个 E2E 测试文件 67 个用例（auto-pair/callout/editor-modes/frontmatter/link-follow/math/shortcuts-customize/toc），修复 4 个既有 flaky 测试（export dialog 死锁、file-tree 定位冲突、outline 动态输入不稳、slash-menu Escape 不删触发字符），`fs.ts` mock 增强（rename/delete/create 同步更新目录树 + 5 个示例文件）。全套 262 单元 + 127 E2E 测试通过。详见 `docs/v2.0.2 设计文档.md`
- **v2.0.1** 修复 Mermaid 流程图多行节点文字底部被边框裁切：渲染含 `<br/>` 多行 + 长中文文本 + `style stroke-width:2px` 加粗边框的纵向流程图时，多个矩形节点文字下沉、最后一行被 rect 底边遮挡，单行菱形判断框正常。根因为三因素叠加——①`:root line-height:1.6` 被 CSS 继承进 mermaid `nodeLabel`，使实际渲染行高 ≈ mermaid 测量行高（~1.2）的 1.33 倍，多行文字溢出底边；②`flowchart.useMaxWidth` 默认 true，长文本回流触发高度重算偏差；③`stroke-width:2px` 加粗边框向内侵占内部高度。修复：①[mermaid-view.ts](src/components/Editor/mermaid-view.ts) 提取 `MERMAID_CONFIG` 常量，补 `flowchart.htmlLabels:true`（保留 `<br/>` 换行）、`padding:20`（默认 15，加大内边距补偿）、`useMaxWidth:false`（关闭宽度回流）、`themeVariables.fontSize:"14px"`（锁定字号）；②[App.css](src/App.css) 新增 `.mermaid .nodeLabel/.edgeLabel` 与 `.mermaid-render .nodeLabel/.edgeLabel` 样式，同时作用于 mermaid 测量阶段（临时 `.mermaid` 容器）与最终渲染阶段，锁定 `line-height:1.25` + `font-size:14px` + 字体，使两阶段文字高度一致。新增 9 个测试用例（`tests/unit/mermaid-render.test.ts`，含用户报告原始流程图代码作回归 fixture），全套 262 个测试通过。详见 `docs/v2.0.1 设计文档.md`
- **v2.0.0** UI 视觉与交互体验全面优化：①建立设计令牌（design token）系统——全应用通过 CSS 变量统一管理品牌强调色（`--accent` 浅色 `#0969da` / 深色 `#2f81f7`，统一原先散落的近似值）、三级文字色阶、分层阴影（`--shadow-sm/md/lg` 替代生硬单层阴影）、圆角梯度（`--radius-sm/md/lg`）、动效曲线（`--ease` / `--duration`）、键盘聚焦环（`--ring`），主题切换只改一处；②统一 SVG 图标库（`icons.tsx`，线性 `stroke=currentColor` 随文字颜色继承，默认 16px / 24×24 viewBox，替代原先混用的 emoji / Unicode 符号，跨平台渲染一致）；③现代化滚动条（10px 细半透明滑块 + 透明轨道 + 内缩 `background-clip`，hover 加深，标签页栏收窄至 3px）；④`:focus-visible` 键盘聚焦环（Tab 键触发蓝环，鼠标点击不干扰）；⑤菜单 / 模态弹入动效（`menu-in` 上移缩放淡入 0.12s、`modal-in` 上浮缩放淡入 0.18s、`backdrop-in` 遮罩淡入、`fade-in` 空状态淡入）；⑥ghost 风格顶栏按钮（无边框、hover 灰底，VSCode / Typora 式）；⑦渐变品牌标题（`background-clip: text` 实现正文色到强调色 135° 渐变）；⑧活跃 tab 卡片样式（顶部 2px 强调色指示条 + 底部连通编辑区 + 关闭按钮 hover 显现）；⑨活跃文件左侧指示条（`box-shadow: inset 2px 0 0`）；⑩iOS 风格 Toggle 开关（`appearance:none` 自定义胶囊轨道 + 圆形滑块，`:checked` 强调色 + 右移过渡）；⑪模态毛玻璃遮罩（`backdrop-filter: blur(2px)`）；⑫文本选择色跟随强调色；⑬全应用过渡曲线统一引用令牌。纯样式重构，编辑器逻辑与功能不变。详见 `docs/v2.0.0 设计文档.md`
- **v1.2.10** 修复全部替换 alert 报错：Tauri webview 自动拦截 `window.alert()` 映射为 `dialog.message` command、`window.confirm()` 映射为 `dialog.ask`，但 `capabilities/default.json` 只授权了 `dialog:allow-open`/`dialog:allow-save` 缺 `dialog:allow-message`/`dialog:allow-ask`，导致全部替换后的 `alert('已替换 N 处')` 报 `command plugin: dialog|message not allowed acl`；补齐两个 dialog 权限修复全项目 20 处 alert/confirm 调用（全部替换、删除确认、重命名失败提示等）；新增 10 个测试用例（search.ts replaceAll/replaceCurrent 6 个 + capabilities 配置防回归 4 个），全套 253 个测试通过
- **v1.2.9** 三项回归修复：①表格列宽拖拽手柄不可见（`columnResizingPlugin` 装配正确但 `App.css` 把手柄 `opacity:0` 且无 `:hover` 显形规则导致永久不可见，补 hover 显形 + `table overflow` 改 `visible`）；②全部替换/保存报错 `message not allowed by acl`（Tauri v2 ACL 对自定义 command 强制校验，app command 不会自动生成权限标识符，新增 `permissions/app-commands.toml` 用 `[[permission]]` 块为 13 个 command 显式定义权限，`capabilities/default.json` 引用 `allow-write-text-file` 等修复自动保存链路及所有 fs 功能）；③代码块点击第一行光标跳到 9-11 行（`CodeBlockNodeView.setSelection` 未做 PM 绝对位置→CM 本地位置翻译，`forwardUpdate` 反馈闭环导致光标跳到 `getPos()+1` 对应位置，改为 `anchor - getPos() - 1` + 边界夹紧，`selectNode` 清空选区，`update` 的 `scrollIntoView` 改 `false`）；新增 6 个 code-block-view 测试用例，全套 243 个测试通过
- **v1.2.8** 三项改进：①新增行内公式插入入口（`insertInlineMath` 命令在光标处插入 `math_inline` atom 节点并自动进入编辑态，工具栏 `$ 行内` 按钮 + 斜杠菜单 `/行内` 双入口，空值显示「公式」占位提示）；②彻底修复 frontmatter 删除块误删底部块（v1.2.7 的 mousedown 监听被 CodeMirror focus 事务冲掉仍失效，`deleteCurrentBlock` 增加 DOM 焦点回退路径——读 `document.activeElement` 反查所属 atom 顶层块，删除块按钮 `onMouseDown preventDefault` 防止抢走 CM 焦点）；③修复列表内点代码块/表格/标题按钮报错 `invalid content for node list_item`（list_item content 要求首子节点为 paragraph，新增 `exitListIfNeeded` 在列表后插入空段落移出光标，`setBlockType`/`insertTable` 调用前先退出列表）；新增 7 个测试用例，全套 237 个测试通过
- **v1.2.7** 修复工具栏 5 个边界 bug：①光标在元数据（frontmatter）上点「删除块」误删文档底部块（改为优先识别 NodeSelection）；②点击目录块（toc）再点「删除块」无反应（同上）；③点两次删除线报错 `there is no position after the top-level node`（insertBlockHere 末尾块越界，改用 try/catch + 夹值）；④点两次列表报错 `invalid content for node list_item`（列表内重复 wrap，改为检测跳过）；⑤代码块内点列表/引用报错 `content does not fit in gap`（code_block/atom 节点不允许 wrap，改为检测跳过 + try/catch 兜底）；新增 14 个测试用例，全套 230 个测试通过
- **v1.2.6** 修复块级公式插入「不能用」：斜杠菜单 `/公式` 和工具栏「∑ 公式」插入空 `math_display` atom 节点后，KaTeX 渲染空字符串无可视内容，用户以为没插入；改为插入后自动 `NodeSelection` 选中节点并通过 `dblclick` 事件触发 NodeView 编辑模式（直接弹出 textarea 输入），空值时显示虚线占位框「双击编辑公式」；新增 6 个 block-commands 测试用例，全套 216 个测试通过
- **v1.2.5** 新增 Mermaid 图表拖动平移：缩放大于 100% 时按住鼠标拖动图表查看各区域（放大后无需调横向/纵向滚动条），双击重置缩放与平移，重新渲染图表时重置平移，`destroy` 钩子清理 window 监听器避免泄漏；新增 11 个测试用例覆盖平移/缩放/双击重置/destroy 清理，全套 210 个测试通过
- **v1.2.4** 修复万行 MD 文档滚轮失效（Ctrl+滚轮的 `passive:false` 监听器常驻导致主线程被阻塞，改为仅在 Ctrl/Cmd 按下时动态挂载/卸载，普通滚动走浏览器合成线程快速路径；逻辑抽到 `useCtrlWheelZoom` hook）；修复工具栏表格「删列/删行」按钮无效（原依赖 CellSelection 未先选中列，改用 `prosemirror-tables` 的 `deleteColumn`/`deleteRow` 基于光标位置直接删除）；新增 24 个测试用例覆盖上述修复（scroll-performance 15 个 + TableToolbar 9 个），全套 199 个测试通过
- **v1.2.3** 新增 HTML 嵌入/行内标签渲染（白名单 + DOMParser + LRU 缓存保性能，过滤 XSS）；新增脚注支持（GFM `[^1]` 语法，点击跳转）；Mermaid 图表新增下载按钮（导出 SVG）和 Ctrl+滚轮缩放（0.5~3x）；补充 mock 示例文件
- **v1.2.2** 新增 `Ctrl/Cmd+滚轮` 缩放文档（50%~300%，`Ctrl/Cmd+0` 重置 100%，状态栏显示百分比可点击重置，缩放级别持久化）；修复 GitHub Action 中 `actions/upload-artifact@v5` 仍声明 `node20` 导致的 Node.js 20 弃用警告（升级到 v7）
- **v1.2.1** 修复 GitHub Action E2E 测试全部失败（断言假设一启动就有 mock 文件树，实际浏览器版需先点击「打开文件夹」加载 mock 工作区）；修复 Node.js 20 弃用警告（actions/checkout、pnpm/action-setup、actions/setup-node、actions/upload-artifact 从 v4 升级到 v5）
- **v1.2.0** 性能优化（插件回调加 `docChanged` 守卫消除每键全树遍历、cursor-saver 防抖落 store、TabsBar/useAutoSave 精准订阅、代码块 NodeView 视口懒挂载、查找面板输入防抖）；新增 Ctrl+R 替换快捷键（逐个/全部替换）；建立自动化测试体系（169 个用例：单元/store/组件/E2E 四层，GitHub Action 测试失败阻断构建）
- **v1.1.5** 修复快捷键系统致命 bug（`matchBinding` 的 `MODIFIER_KEYS` 漏了 `"mod"`，导致 Ctrl+F/Ctrl+\/Ctrl+'/Ctrl+\/Ctrl+, 全部失效）；新增 Ctrl+K 插入链接、Ctrl+Alt+0 转普通段落（Typora 标准快捷键）
- **v1.1.4** 修复点击文档右侧空白区会跳到文档最底部：原逻辑在 `posAtCoords` 返回 null 时直接在文档末尾追加段落，现改为把 x 坐标夹到编辑器内容区内重查 `posAtCoords`，让光标落在点击 y 对应的行附近
- **v1.1.3** 修复无序/有序列表插入报错 `content does not fit in gap`（wrap 时漏包 `list_item` 层）；工具栏新增「删除块」按钮，可删除光标所在的整个块（引用/代码块/Mermaid/提示框/元数据/列表/公式/TOC/分割线）；优化 mermaid/frontmatter 的 `stopEvent`，非编辑态可点击选中后 Backspace 删除
- **v1.1.2** 更换应用图标（`tauri icon` 重新生成全平台图标：Windows ico/StoreLogo、macOS icns、iOS、Android 全套）
- **v1.1.1** 修复多个块插入问题：分割线/表格/公式/callout/TOC 落在下一行（空段落直接替换）、列表/引用 wrap 报错（合并到单个 transaction）、表格列宽调整报错 `invalid content for node table_row`（GFM 表头行需用 `table_header_row`）；Mermaid 图表与块级/行内公式支持双击编辑源码；Ctrl+A 全选全文；点击编辑器空白处自动追加段落并定位光标；Ctrl+N 新建草稿后自动聚焦编辑器
- **v1.1.0** 新建文件（Ctrl+N 开未命名草稿页，Ctrl+S 弹另存为对话框选保存位置，保存后才开启自动保存）；工具栏重构——从编辑器内部提升到标题栏下方固定不消失，并把斜杠菜单支持的块类型（标题/列表/引用/代码块/分割线/表格/公式/Mermaid/提示框/目录/元数据）全部做成按钮；修复斜杠菜单插入的表格无法填写（cell 内容由非法的 text node 改为空 paragraph）
- **v1.0.1** 修复文件关联：双击 .md 文件启动程序后自动打开该文件；新增单实例支持（程序已运行时双击不开新实例，转发文件路径到主窗口打开）
- **v1.0.0** 🎉 首个正式版。品牌重命名 Inkling → InklingMD，新增 MIT 开源许可证与贡献者指南；修复中文句号字形（issue #9）、合并 PR #8 本地图片相对路径；侧边栏打开按钮改为图标样式
- **v0.9.0** 多面板分屏（标签页右键「在分屏打开」，双编辑器左右对照 + 交换）、拖拽块排序（⋮⋮ 手柄整块重排）、导出长图 PNG（html2canvas）、文档大纲导出、多窗口（文件/标签页右键「在新窗口打开」，Tauri WebviewWindow）
- **v0.8.4** 拼写检查开关（偏好设置）、单文件模式（打开散落 md 不绑定文件夹）
- **v0.8.3** 修复专注模式无效果（CSS 选择器层级写反）
- **v0.8.2** 定位并修复打开 md 白屏根因（remark-frontmatter 缺少 options）
- **v0.8.1** 修复打开 md 白屏 + 侧边栏关闭后无法打开文件死锁（编辑器降级与全局错误捕获）
- **v0.8.0** 禅模式（F11）、文件夹折叠状态记忆、书签/收藏、自动配对补全、图片缩放/对齐、行内图片、快捷键帮助补充 F11
- **v0.7.0** 全局搜索（`Ctrl+Shift+F`）、斜杠菜单 `/`、callout 提示框、标签页右键菜单 + 拖拽重排、文件树重命名/删除/新建、最近打开文件列表、编辑位置记忆、编辑器错误边界（修复打开部分 md 文件白屏问题）
- **v0.6.0** 导出 Word（.docx，走 Pandoc）、应用级快捷键自定义面板（含冲突检测、一键恢复默认）
- **v0.5.0** 专注模式 / 打字机模式、查找替换（正则）、偏好设置面板、YAML Front Matter、脚注、`[TOC]` 目录自动生成、文件外部修改监听、快捷键体系与帮助面板、复制为富文本/Markdown
- **v0.4.0** 多标签页编辑（标签页切换、关闭确认、文件树已打开标记）
- **v0.3.0** 主题系统与明暗模式、导出 HTML/PDF、大纲面板、Mermaid 图表、KaTeX 公式
- **v0.2.0** 图片渲染与拖拽/粘贴上传、链接跟随
- **v0.1.0** 基础所见即所得编辑器

## 贡献者

感谢以下小伙伴为本项目做出的贡献（按字母序）：

- **Haoze Wu** ([@TomGoh](https://github.com/TomGoh)) — 修复本地图片相对路径解析（PR #8）、中文句号字形修复建议（issue #9）
- **zhkp** ([@zhkp](https://github.com/zhkp)) — 项目作者，主要开发与维护

欢迎更多朋友参与贡献，详见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## License

[MIT](./LICENSE) © 2026 zhkp

