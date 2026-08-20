# Changelog

本项目所有值得记录的变更都汇入本文件，格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本语义遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [2.3.8] - 2026-08-21

批量修复 issue #59-#67：

### 修复

- **#59** 外部修改保存保护：`OpenTab` 记录 `diskContent` 磁盘基线，Ctrl+S 保存前直读磁盘与基线比对，外部已改则弹二次确认（拒绝即中止保存），消除 3 秒轮询窗口期内的静默覆盖；新增 `reloadFile` store 方法强制从磁盘重读（`openFile` 对已打开 tab 只切缓存不重读，此前冲突对话框 / 文件监听的重载是假重载）。
- **#60** 未命名草稿粘贴/拖拽图片报错：检测 `untitled-N` 虚拟路径（此前仅判空会漏掉草稿场景，按 CWD 解析出错误路径导致写盘失败），草稿场景跳过目录解析与写盘，图片以 Data URL 内联插入，另存后随文档自带。
- **#62** 全局搜索点击结果总跳到本文件第一处匹配：改为按「点击项是本文件第 N 处命中」定位对应第 N 次出现（ProseMirror 块节点文本不含换行符，行号累计算不出目标位置）；正则模式先从命中行提取实际匹配文本再找；未命中回退块级定位。
- **#65** 多级嵌套列表子项内点删除块误删整个顶级列表：删除前先沿祖先链找最近 `list_item`，只删当前子项；父列表仅剩这一项时删整个列表（不留空列表）。
- **#67** PNG 长图导出丢失 Callout/代码块/Mermaid/表格样式：离屏容器原先把 `editor-scroll`/`milkdown` 挂在同一元素上，无法命中 `App.css` 的后代选择器；改为复刻真实编辑器三层嵌套 `[data-theme] > .editor-scroll > .milkdown`，导出图与编辑器所见一致（含深色主题）；截图前等待全部图片 decode/load（3s 超时保护），背景色取 `.milkdown` 实际计算的主题背景。

### 安全

- **#64** 收敛 Tauri assetProtocol 权限：静态 scope 从 `**`（全盘任意路径）收敛到 `$APPDATA`/`$DOCUMENT`/`$HOME` 等用户目录；新增 Rust `allow_asset_dir` 命令，前端解析图片路径时按需把文档所在目录加入运行时白名单（模块级 Set 去重避免重复 IPC，失败回退静态白名单），只放行用户实际打开的目录，最小权限。

### 变更

- **#61** 多窗口实例间主题 / 偏好设置 / 快捷键覆盖实时同步：三个 store 监听 `storage` 事件（仅在 other 窗口修改时触发，天然无回环），一窗修改全部窗口即时生效。
- **#63** Pandoc 导出 Word 临时文件名固定导致并发导出互相覆盖：改为 `inkling-export-{pid}-{纳秒时间戳}-{原子自增序号}.md` 唯一命名。

### 文档

- **#66** CONTRIBUTING 补 Linux（Ubuntu/Debian）Tauri 系统依赖安装清单、Pandoc 三平台安装指引、本地测试命令；README 导出功能说明同步 Pandoc 安装链接与 PNG 导出样式对齐描述。

### 测试

- 新增 13 个前端用例（草稿贴图 3 / 保存冲突与 reloadFile 7 / 嵌套列表删块 3）+ 1 个 Rust 用例（临时路径唯一性），全套 411 个测试通过。

详见 [docs/v2.3.8 设计文档.md](docs/v2.3.8%20设计文档.md)。

## [2.3.7] - 2026-08-16

### 新增

- **外部文件变动冲突对话框**（用户口头反馈）：本地有未保存修改且磁盘文件被外部修改（Git 切分支/网盘同步）时，不再用 confirm 二选一，改为冲突对话框提供四选项——①保留本地并另存副本（`*.backup.md`，已占用自动递增编号，存后重载磁盘最新）②查看差异对比（自研行级 LCS diff，公共前后缀修剪 + 大差异降级，unified 视图标注「本地未保存 / 磁盘外部修改」两侧）③丢弃本地修改重载磁盘 ④继续编辑（明示稍后保存将覆盖磁盘）。修复原先「取消后直接保存会静默覆盖外部修改，无备份无感知」的数据丢失风险。非脏状态保持原有 confirm 重载询问。

### 工程化

- **发版前置校验（CI release-guard）**：仅 `v*` tag 触发，平时提交不受影响。校验①`package.json`/`tauri.conf.json`/`Cargo.toml`/`Cargo.lock` 四处版本号一致且与 tag 名一致（`scripts/check-version.mjs`）；②自上一 tag 以来有代码变更时 `CHANGELOG.md`/`README.md`/`docs/` 至少一处已更新（`scripts/check-docs-updated.mjs`）。任一失败则阻止 Release 发布。

## [2.3.6] - 2026-08-16

### 重构

- **#49**：将 1025 行的 `src/store/workspace.ts` 拆分为 `src/store/workspace/` 下的 4 个 Zustand slice（`fileTree` / `tabs` / `bookmarks` / `recents`）+ `shared.ts` / `types.ts`，`workspace.ts` 仅保留 slice 组合与导出，对外 API 不变。
- **#50**：拆分三个巨型组件，行为不变：
  - `Sidebar` 912 → 128 行：抽出 `WorkspaceFileTree` / `FileTreeNode` / `TreeContextMenu` / `RecentFiles` / `Bookmarks` / `FileOpenStatus` 子组件 + `useRename` / `useNewItem` hooks + `treeShared` 共享类型；
  - `Editor` 741 → 472 行：抽出 `cursor-saver` / `table-tracker` / `select-all` 三个 ProseMirror 插件 + `useSourceModeTransition` hook + `editor-root-click` 空白点击定位；
  - `App` 734 → 281 行：抽出 `Topbar/`（`EditorTopbar` / `ExportMenu` / `ThemeMenu` / `SaveIndicator`）+ `SplitPane` 分屏组件 + `useGlobalShortcuts` / `useStartupFile` hooks。

### 文档

- **#51**：版本历史从 `README.md` 迁移到独立 `CHANGELOG.md`（Keep a Changelog 风格），`README.md` 仅保留最近 5 个版本摘要并链接本文件。
- **#52**：新增 `ARCHITECTURE.md`，梳理整体分层、关键模块职责与数据流，链接 `docs/` 深度设计文档。

## [2.3.5] - 2026-08-16

专注模式复合块高亮修复 + Rust 命令单测补全 + 版本号同步：

- **#56** 修复专注模式点击列表/表格当前块不高亮——`editor-modes.ts` 装饰原先取光标所在「最内层块」（`findParentNodeClosestToPos(n => n.isBlock)`），列表（`bullet_list > list_item > paragraph`）/表格（`table > table_row > table_cell > paragraph`）内命中内部 paragraph，而 CSS 只高亮 `.ProseMirror` 直接子节点，导致外层列表/表格被整体弱化到 0.35 点不亮；改为取光标所在「文档顶层块」（`$head.node(1)`，即 `.ProseMirror` 直接子节点），装饰粒度与 CSS 高亮粒度一致，列表→`bullet_list`/`ordered_list`、表格→`table` 均正确点亮，新增 `tests/unit/editor-modes.test.ts` 5 个用例验证各块类型。
- **#47** 为 `search.rs` 的 `search_in_workspace` 补 9 个单测（空查询/工作区不存在/大小写切换/非法正则/跨文件行号与路径/隐藏目录跳过/非 UTF-8 静默跳过/UTF-8 列号计数/超大文件跳过），复用 `mod.rs` 既有临时目录模式。
- **#48** 为 `pandoc.rs` 补单测并做「参数拼装与执行分离」重构（`build_pandoc_command`/`run_pandoc`），用注入假脚本覆盖 `--resource-path` 追加/非目录忽略/pandoc 缺失/非零退出码/成功 5 个分支，无需 CI 安装 pandoc。
- CI `test` job 增加 Rust `cargo test` 步骤；同步 Cargo.toml/Cargo.lock/tauri.conf.json/package.json 版本号至 2.3.5（此前 Cargo.toml 滞后在 2.2.0）。

详见 [docs/v2.3.5 设计文档.md](docs/v2.3.5%20设计文档.md)。

## [2.3.4] - 2026-08-14

打开瞬间抖动根治 + 切 tab 大纲定位修复：

- v2.3.3 后用户实测仍有两个问题——打开文件瞬间抖动一下且文件越大越抖；切 tab 后大纲高亮停在顶部需手动滚动才恢复。
- 问题①根因是打开路径上三个「渐进改变高度」环节都在首帧后发生、浏览器滚动锚定逐次补偿：代码块懒挂载前 `cmHost` 为空 div、Mermaid 未缓存首渲染高度跳变、滚动恢复被未撑开的 scrollHeight 钳制。修复：代码块挂载前用与 CodeMirror 同字体/行高/padding/max-height 的 `<pre>` 纯文本占位（挂载前后高度差≈0）；Mermaid 首渲染 min-height 取 max(占位, 实测) 只增不减；滚动恢复逐帧重试到 30 帧上限。
- 问题②为 v2.3.3 采样重构引入：切 tab 重灌文档后选区被钳到文档头，大纲重算按选区推导高亮跳回顶部且此后无 scroll 事件触发采样。修复：重算完成后按当前 scrollTop 采样定位，防抖窗口内标记 stale 跳过采样与选区推导，插件创建后追加 rAF 初始采样兜底。

详见 [docs/v2.3.4 设计文档.md](docs/v2.3.4%20设计文档.md)。

## [2.3.3] - 2026-08-12

大文档窗口抖动 + 引用块滚动掉帧根治：

- ①视口上方图表后台预渲染变高触发滚动锚定反复补偿（抖动），且重复图表每张仍 ~150ms 全量渲染形成 ~9s 预渲染风暴。修复：按源码 LRU 缓存 SVG + 实测高度（命中仅 ~2ms），创建即预留精确高度（占位→渲染跳变为 0），空闲队列跳过视口上方图表（锚定补偿消失）。
- ②`posAtCoords` 采样在万行文档线性扫描文档级子节点 rect，引用块区域单次 55-67ms。修复：批量缓存标题元素滚动坐标，采样退化为 scrollTop 与缓存数组二分比较 + 120ms 节流，彻底移除 posAtCoords，缓存随文档变更防抖重建并在总高/宽度变化时自动重建。

详见 [docs/v2.3.3 设计文档.md](docs/v2.3.3%20设计文档.md)。

## [2.3.2] - 2026-08-10

万行多图文档滚动掉帧修复：v2.3.1 的视口懒渲染把渲染开销从「打开时」转移到「滚动时」——滚到未渲染图表处逐张 ~150ms 卡顿。修复：`mermaid-view.ts` 新增空闲预渲染队列，`requestIdleCallback` 每个空闲槽渲染一张，滚动停歇 250ms 内自动暂停，滚得快落在未预渲染图表时仍由视口即时渲染兜底。实测静止 16s 后 59/60 张后台完成；全文滚动 51 长任务/4.2s → 27/2.8s。详见 [docs/v2.3.2 设计文档.md](docs/v2.3.2%20设计文档.md)。

## [2.3.1] - 2026-08-08

万行多图文档打开卡顿修复：Mermaid 图表打开即同步渲染全部（每张 ~150ms，60 张 ~9s 长任务）。修复：图表改为 IntersectionObserver 视口懒渲染（300px 预载边距），视口外仅保留占位容器，`update` 在进入视口前跳过渲染。实测打开时长任务 6.5~7.4s → 1.9s。详见 [docs/v2.3.1 设计文档.md](docs/v2.3.1%20设计文档.md)。

## [2.3.0] - 2026-08-06

性能回退修复 + 源码模式增强 + 保存链路稳健性 + 社区修复：

- **#31** 修复万行文档编辑/滚动掉帧（保存路径 flush 跳过 idle 编辑器，避免重复全文序列化）。
- **#29** 源码模式查找替换——`Ctrl/Cmd+F`/`Ctrl/Cmd+R` 在源码模式路由到 CodeMirror 内置查找/替换面板。
- **#26** 光标/滚动映射增强——按源行权重映射 PM 位置 + 光标行片段匹配回退。
- **#27** 退出源码模式重置撤销历史；**#28** 源码模式可访问性（ARIA 属性）。
- 打开文件不再误判 dirty（publisher 以解析后 doc 序列化结果为同步基线）。
- **#25** Markdown 往返保真单测——无头 Milkdown 驱动真实 parser/serializer，修复 toc 节点序列化静默丢失 `[TOC]` 的真 bug。
- 保存链路（PR #34）、多标签滚动/光标位置按文件路径读写（#30/PR #35）、macOS E2E 平台按键兼容（#36/PR #37）、CI 双平台矩阵。

详见 [docs/v2.3.0 设计文档.md](docs/v2.3.0%20设计文档.md)。

## [2.2.0] - 2026-07-30

新增源代码模式（#19）：整页切换为 CodeMirror 6 编辑原始 Markdown（GFM 高亮 + 行号）；顶栏按钮 + 默认 `Ctrl/Cmd+Alt+S`；按标签页记忆；与专注/打字机互斥；退出 re-parse 回 WYSIWYG；分屏独立切换。详见 [docs/v2.2.0 设计文档.md](docs/v2.2.0%20设计文档.md)。

## [2.1.0] - 2026-07-20

合并社区贡献者 @TomGoh 的三项工作区/主题修复并新增 Linux 发行版：

- **#11/PR #15** 大型工作区按需加载与文件树渲染（Rust `list_dir` 单层浅扫 + `spawn_blocking`，前端按需加载 + 窗口化渲染）。
- **#14/PR #16** 同步原生控件与主题配色（`color-scheme`）。
- **#12/PR #17** 打开文件保留侧边栏文件树（行内 spinner/错误图标 + 竞态处理）。
- **#13/PR #18** Release 增加 Linux amd64 构建（AppImage + deb）。

详见 [docs/v2.1.0 设计文档.md](docs/v2.1.0%20设计文档.md)。

## [2.0.2] - 2026-07-10

补全 E2E 测试覆盖并修复测试驱动的三个生产 bug：`auto-pair.ts` 无选区配对崩溃；`callout.ts` 解析器不兼容 Obsidian 常见写法；`frontmatter.ts` NodeView 漏设 `data-value`。新增 8 个 E2E 文件 67 用例，修复 4 个 flaky 测试。详见 [docs/v2.0.2 设计文档.md](docs/v2.0.2%20设计文档.md)。

## [2.0.1] - 2026-07-08

修复 Mermaid 多行节点文字底部被边框裁切：三因素叠加（`:root line-height` 继承、`useMaxWidth` 回流、`stroke-width` 向内侵占）。修复：`mermaid-view.ts` 提取 `MERMAID_CONFIG` 常量补 `htmlLabels:true`/`padding:20`/`useMaxWidth:false`/`fontSize:14px`，`App.css` 锁定两阶段 `line-height`/`font-size`，新增 9 个回归用例。详见 [docs/v2.0.1 设计文档.md](docs/v2.0.1%20设计文档.md)。

## [2.0.0] - 2026-07-01

UI 视觉与交互体验全面优化：①设计令牌系统（CSS 变量统一配色/阴影/圆角/动效/聚焦环）；②统一 SVG 图标库（`icons.tsx` 线性风格）；③现代化滚动条；④`:focus-visible` 键盘聚焦环；⑤菜单/模态弹入动效；⑥ghost 顶栏按钮；⑦渐变品牌标题；⑧活跃 tab 卡片样式；⑨活跃文件左侧指示条；⑩iOS 风格 Toggle；⑪模态毛玻璃遮罩；⑫文本选择色；⑬过渡曲线统一令牌。纯样式重构，编辑器逻辑不变。详见 [docs/v2.0.0 设计文档.md](docs/v2.0.0%20设计文档.md)。

## [1.2.10] - 2026-06-20

修复全部替换 alert 报错：Tauri ACL 缺 `dialog:allow-message`/`dialog:allow-ask` 权限，补齐后修复全项目 20 处 alert/confirm 调用；新增 10 个测试用例。

## [1.2.9] - 2026-06-18

三项回归修复：①表格列宽拖拽手柄不可见（补 hover 显形）；②全部替换/保存报错 `message not allowed by acl`（新增 `permissions/app-commands.toml` 为 13 个 command 显式定义权限）；③代码块点击第一行光标跳到 9-11 行（`CodeBlockNodeView.setSelection` 位置翻译修正）。新增 6 个测试用例。

## [1.2.8] - 2026-06-15

三项改进：①新增行内公式插入入口（`insertInlineMath`）；②彻底修复 frontmatter 删除块误删底部块（增加 DOM 焦点回退路径）；③修复列表内点代码块/表格/标题按钮报错（新增 `exitListIfNeeded`）。新增 7 个测试用例。

## [1.2.7] - 2026-06-12

修复工具栏 5 个边界 bug（删除块误删、toc 删除无反应、末尾块越界、列表重复 wrap、代码块内 wrap 报错）。新增 14 个测试用例。

## [1.2.6] - 2026-06-08

修复块级公式插入「不能用」：插入空 `math_display` 节点后自动 `NodeSelection` 选中并 dblclick 进入编辑态，空值显示虚线占位框。新增 6 个测试用例。

## [1.2.5] - 2026-06-05

新增 Mermaid 图表拖动平移：缩放 >100% 时拖动查看、双击重置、重新渲染时重置平移、`destroy` 清理监听器。新增 11 个测试用例。

## [1.2.4] - 2026-06-02

修复万行文档滚轮失效（`passive:false` 监听器改按需挂载，抽到 `useCtrlWheelZoom` hook）；修复表格「删列/删行」按钮无效（改用 `prosemirror-tables` 直接删除）。新增 24 个测试用例。

## [1.2.3] - 2026-05-28

新增 HTML 嵌入/行内标签渲染（白名单 + DOMParser + LRU 缓存，过滤 XSS）；新增脚注支持；Mermaid 新增下载按钮和 Ctrl+滚轮缩放。

## [1.2.2] - 2026-05-25

新增 `Ctrl/Cmd+滚轮` 缩放文档（50%~300%）；修复 GitHub Action 中 actions/upload-artifact@v5 的 node20 弃用警告。

## [1.2.1] - 2026-05-22

修复 GitHub Action E2E 测试全部失败（需先点击「打开文件夹」加载 mock 工作区）；修复 Node.js 20 弃用警告（actions 从 v4 升级到 v5）。

## [1.2.0] - 2026-05-20

性能优化（插件回调 `docChanged` 守卫、cursor-saver 防抖、TabsBar/useAutoSave 精准订阅、代码块视口懒挂载、查找面板防抖）；新增 Ctrl+R 替换快捷键；建立自动化测试体系（169 用例，GitHub Action 阻断构建）。

## [1.1.5] - 2026-05-15

修复快捷键系统致命 bug（`matchBinding` 的 `MODIFIER_KEYS` 漏了 `"mod"`，导致 Ctrl+F/Ctrl+\/Ctrl+'/Ctrl+, 失效）；新增 Ctrl+K 插入链接、Ctrl+Alt+0 转普通段落。

## [1.1.4] - 2026-05-12

修复点击文档右侧空白区跳到文档最底部：把 x 坐标夹到内容区内重查 `posAtCoords`。

## [1.1.3] - 2026-05-10

修复无序/有序列表插入报错（wrap 漏包 `list_item`）；工具栏新增「删除块」按钮；优化 mermaid/frontmatter 的 `stopEvent`。

## [1.1.2] - 2026-05-08

更换应用图标（`tauri icon` 重新生成全平台图标）。

## [1.1.1] - 2026-05-06

修复多个块插入问题（分割线/表格/公式/callout/TOC 落行、列表/引用 wrap 报错、表格列宽调整报错）；Mermaid 与公式支持双击编辑源码；Ctrl+A 全选全文；点击空白追加段落；Ctrl+N 新建草稿自动聚焦。

## [1.1.0] - 2026-05-01

新建文件（Ctrl+N 未命名草稿，Ctrl+S 另存为）；工具栏重构成固定行并把斜杠菜单块类型全部做成按钮；修复斜杠菜单插入表格无法填写。

## [1.0.1] - 2026-04-25

修复文件关联（双击 .md 自动打开）；新增单实例支持（程序已运行时转发文件路径到主窗口）。

## [1.0.0] - 2026-04-20

首个正式版。品牌重命名 Inkling → InklingMD，新增 MIT 开源许可证与贡献者指南；修复中文句号字形（#9）、合并 PR #8 本地图片相对路径；侧边栏打开按钮改为图标样式。

## [0.9.0] - 2026-04-10

多面板分屏（标签页右键「在分屏打开」）、拖拽块排序（⋮⋮ 手柄）、导出长图 PNG、文档大纲导出、多窗口（Tauri WebviewWindow）。

## [0.8.4] - 2026-04-05

拼写检查开关；单文件模式（打开散落 md 不绑定文件夹）。

## [0.8.3] - 2026-04-03

修复专注模式无效果（CSS 选择器层级写反）。

## [0.8.2] - 2026-04-02

定位并修复打开 md 白屏根因（remark-frontmatter 缺少 options）。

## [0.8.1] - 2026-04-01

修复打开 md 白屏 + 侧边栏关闭后无法打开文件死锁（编辑器降级与全局错误捕获）。

## [0.8.0] - 2026-03-28

禅模式（F11）、文件夹折叠状态记忆、书签/收藏、自动配对补全、图片缩放/对齐、行内图片、快捷键帮助补充 F11。

## [0.7.0] - 2026-03-20

全局搜索（`Ctrl+Shift+F`）、斜杠菜单 `/`、callout 提示框、标签页右键菜单 + 拖拽重排、文件树重命名/删除/新建、最近打开文件列表、编辑位置记忆、编辑器错误边界。

## [0.6.0] - 2026-03-12

导出 Word（.docx，走 Pandoc）、应用级快捷键自定义面板（含冲突检测、一键恢复默认）。

## [0.5.0] - 2026-03-05

专注模式 / 打字机模式、查找替换（正则）、偏好设置面板、YAML Front Matter、脚注、`[TOC]` 目录自动生成、文件外部修改监听、快捷键体系与帮助面板、复制为富文本/Markdown。

## [0.4.0] - 2026-02-25

多标签页编辑（标签页切换、关闭确认、文件树已打开标记）。

## [0.3.0] - 2026-02-15

主题系统与明暗模式、导出 HTML/PDF、大纲面板、Mermaid 图表、KaTeX 公式。

## [0.2.0] - 2026-02-05

图片渲染与拖拽/粘贴上传、链接跟随。

## [0.1.0] - 2026-01-20

基础所见即所得编辑器。