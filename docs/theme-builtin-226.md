# #226 内置主题扩充 + 导出一致性 + 渲染组件跟随（实施说明）

> 对应设计集 `04-内置主题扩充与导出一致性.md` 与 issue #226（Theme Epic 3/3）。前置：`#223` / `#224` / `#225` / `#306` / `#307` / `#308`。
> 本文件写**实施口径与证据**；设计取舍原文见设计集。

## 1. 数量口径（下限）

| 口径 | 本批交付 |
|---|---|
| 自研内置主题 | **4 套**（技术·亮 / 技术·暗 / 纸感阅读 / 高对比 a11y） |
| 预装第三方主题（`#308`） | 3 款 6 个 themeId（Drake / Lapis / Notion 各明暗） |
| **合计（`#221` 口径 ≥6）** | **10 个 themeId**（内置分组 6 + 已导入分组 6，含预装明暗） |

四类风格落点：**亮色技术风**（`builtin:tech`）／**暗色技术风**（`builtin:tech-dark`，与前者成对）／**暖色阅读风**（`builtin:sepia`）／**高对比 a11y**（`builtin:contrast`，纯黑边框与文字、强化聚焦环）。

## 2. 载体与身份（不改既有契约的做法）

- 自研主题 = **`builtin:<slug>` + `AppTheme.css = { kind: "text" }`**：样式是构建期文本，**同步可得 → 零闪烁**（`isSnapshotEligible` 为假，不走快照）。
- 注入仍由 `#225` 的 `injectThemeCss` 包进 **`@layer theme`**：层序 `base → theme → user` 与优先级链**完全不变**。
- **`data-theme` 保持 light/dark 二值**（由 `theme.mode` 派生）：自研主题靠 `@layer theme` 的**变量覆盖**做差异，不扩 `data-theme` 取值 —— 于是 `App.css` 的两块基线、`#306` 兼容层、导出与 `#308` 的预装识别都不需要改。
- 主题文件**只写 `:root` 变量块、不写选择器、不引 at-rule**；自研主题是**受信内容**，允许覆盖含 `--shell-*` 的全部三层（第三方主题才走作用域收敛）。
- 与 `#308` 的边界不变：本批是**自研**；第三方预装仍走清单驱动识别（N13/N15）。

## 3. 静态断言（每套主题防漏覆盖）

`tests/theme/theme-builtin.test.ts`：
1. 数量 ≥4、id 形态 `builtin:*`、`mode` 合法、四类风格都有落点；
2. 成对互指（`builtin:tech` ↔ `builtin:tech-dark`）且内置清单包含全部自研主题（顺序 = 声明顺序，菜单里成对相邻）；
3. **必需 token 全覆盖**（`REQUIRED_OVERRIDES`）；
4. **只含 `:root` 变量块**（无选择器 / 无 at-rule）——防止主题偷偷改写选择器层；
5. 覆盖的 token **必须已在 `token-whitelist.json`**（不出幽灵 token）；
6. 值形态合法（挡住手写色值错误；这条已实际抓到一个 `#095janvier`）；
7. 注入行为：`applyTheme` 后 `data-theme` 同步就位、产物含 `@layer theme`、回基线时卸载样式。

`tests/theme/app-registry.test.ts` 同步登记新现实（内置清单 = 基线 2 + 自研 4；载体 `kind` 分列：基线 `none` / 自研 `text`）。

## 4. 导出一致性（PNG / HTML / PDF）

共用模块 `src/lib/exportTheme.ts`（三路同一套口径，避免三处各自复刻）：

| 路径 | 是否跟随 | 实现 |
|---|---|---|
| **PNG 长图** | **跟随** | 离屏容器 `[data-theme] > .editor-scroll > .milkdown` **追加到当前文档** → 复用 `<head>` 里已有的样式表（含 `#inkling-theme`，其 `.editor-scroll .milkdown …` 后代选择器天然命中）；**不注入第二份主题 CSS**（A-4 明确禁止）；本轮起**连同 `data-theme-id` 一起复刻**（元数据锚点对齐，避免将来按它写的规则在导出图里静默失效） |
| **HTML 导出** | **跟随** | 独立文档：① 层序声明（与 `index.html` 逐字同句）② **内联当前文档的样式表**（`<style>` 取 `textContent`、`<link>` 同源 fetch；保持顺序 → 各表的 `@layer` 归属不变）③ 纸张骨架（**未分层、只写结构属性**）④ 正文包回 `.editor-scroll > .milkdown` 两层 ⑤ `<html>` 写 `data-theme` / `data-theme-id` |
| **PDF 打印** | **跟随** | 打印的就是上述独立文档；`@media print` 里显式 `.editor-scroll { height: auto; overflow: visible }`（应用样式里它是 `height:100% / overflow:auto`，独立文档会**裁切内容** —— §4.2 的验收项） |

两条不变量（测试断言锁住）：
- **纸张骨架不得含颜色/字体声明**：它未分层（优先级最高），若写颜色会盖掉主题层；
- **骨架不放进任何层**，且在 `@layer` 声明之后 → 稳定覆盖应用的结构性声明，同时不参与主题竞争。

**#322 修复（多表拼接与 `@import`）**：多张样式表拼进同一个 `<style>` 后，只有**第一张表**的表首 `@import` 仍合法，其余表的会落到「表中间」被浏览器**静默忽略**（应用侧却认可用户自定义 CSS 的表首 `@import` → 同一份 CSS「应用里生效、导出里失效」）。现在 `buildExportCss` 对**每张表**复用 `splitLeadingImports`（`#315`/`#320` 的同一份表首判定），把各表的 `@import` 连同其前置 trivia 统一提到产物最前（保持相对顺序；`@layer base, theme, user;` 是 `@layer` **语句**，按 Cascade 5 允许位于 `@import` 之前）。单测补了「非首表带 `@import`」与「多表各自带 `@import` 保持相对顺序」两条。

`tests/lib/export-theme.test.ts`（12 条）：层序声明在最前、三表内联且顺序正确、取不到的样式表计入 `skipped` 而不静默丢、正文两层包裹、`data-theme`/`data-theme-id` 就位、标题转义、骨架无颜色声明、打印块放开 `.editor-scroll` 裁切。

**`asset.localhost` 背景图 × `html2canvas`（#348，已真机实测闭环）**：**不丢图**。真机打包形态（WebView2 + CSP + assetProtocol，`tauri 2.11.5`）下用 `scripts/probe-asset-bg-export.mjs` 造「带 asset 背景图」的离屏卡片，按 `exporter.ts` 的同参数（`useCORS: true`、未开 `allowTaint`、`scale: 2`）导出后采样：内联 style 与**样式表规则**两种声明都被正常画进画布（[38,35,38] ≈ 探针图中心 [35,35,35]，容差 30；而「指向不存在文件」的对照只剩标记色 [255,0,255]）。根因：asset 协议响应本就带 `Access-Control-Allow-Origin`（`tauri-2.11.5/src/protocol/asset.rs:39` 注入 `window_origin`，与页面 origin 一致）⇒ 跨源头在位、`useCORS` 生效。**结论：不要改 `allowTaint`**（那会污染 canvas，让 `toBlob` 直接抛 SecurityError）。CI 侧守卫：E2E `tests/e2e/export.spec.ts` 的 `E7`（跨源 + ACAO 必须画上 / 缺 ACAO 不画上）+ 单测 `tests/unit/export-png.test.ts` 的参数不变量。

探针 `scripts/probe-asset-bg-export.mjs` 的退出码口径（#350 起与 `docs/asset-csp-309.md` 同型；由 `tests/unit/asset-bg-probe.test.ts` 源级锁定，改码不更表会红）：

| 退出码 | 含义 |
|---|---|
| 0 | 判定**通过**：三条对照成立 + asset 背景图被正常画进导出画布（N1 疑点不成立） |
| 1 | 用法/环境错（缺参数、CDP 连不上、找不到应用页、找不到 html2canvas UMD 产物） |
| 2 | 自检失败：对照不成立（对照 A 没画上 / 对照 B 被画上 / 探针图中心像素≈标记色）⇒ 本轮**结论无效** |
| 3 | 页面是 devUrl 形态（`http://localhost:1420/`）⇒ 不带 CSP，不是本次要评测的形态 |
| 4 | 判定**失败**：asset 背景图**没被画进导出画布** ⇒ 静默丢图复现（JSON 的 `verdict` 给归因） |
| 5 | 渲染超时：某条用例在 20s 内没有返回（html2canvas 加载图片无超时，asset 协议无响应即永久 pending）⇒ 本轮**无法判定** |

两条踩过的纪律：探针图**每次换新文件名**（否则可能命中上次缓存）、**中心像素不能是标记色** `#ff00ff`。
判定顺序固定为 **devUrl 形态（3）→ 渲染超时（5）→ 自检（2）→ 目标判定（0/4）**：devUrl 页面必然没有 CSP，若把自检放在前面，专属退出码 3 永远不可达（#340 的同型教训）；超时没返回时「有没有画上」这个观测不成立，若落进自检或丢图，会把「挂死」误报成「对照不成立」或「静默丢图」（#350 复核阻塞项 3）。
两处长度防护都**不可省**，且归因必须分开：诊断 `fetch(assetUrl)` 带 **5s 超时**（`corsFetch.timeout` / `corsFetch.cspBlocked` 互斥，超时对 CORS 无判定力）；`runCase()` 的 `html2canvas` 调用带 **20s 超时**（html2canvas 1.4.1 的 `CacheStorage.loadImage` 只有 `onload`/`onerror`，asset 协议无响应即永久 pending —— 它既不落进 `cspBlocked`，也不落进 exit 4 的丢图文案）。该「既不拒绝也不响应」形态**本机未复现**（要构造它需改 tauri 侧协议行为），本轮以源级断言 + 突变验证为准；真机若撞到，出口即 `5`。

**版本绑定（#351）**：这条结论依赖**上游 tauri crate 的行为**（asset 协议响应按 `window_origin` 注入 `Access-Control-Allow-Origin`），实测版本为 `tauri = 2.11.5`（`src-tauri/Cargo.toml` 是 caret 约束 `"2"`，实际版本由 `src-tauri/Cargo.lock` 锁定）。②③④ 三道 CI 守卫（`#306` 主题 URL 改写 / `useCORS` 参数不变量 / 跨源 E2E）在**上游行为变化时照样全绿**，只有真机探针能发现 ⇒ **升级 tauri 后必须重跑探针确认 `exit 0`**，清单见 [CONTRIBUTING.md](../CONTRIBUTING.md)「依赖升级」。

## 5. 渲染组件的主题跟随

### 5.1 Mermaid（`src/components/Editor/mermaid-view.ts`）

实测两处硬约束，本轮都闭环：

| 约束 | 处理 |
|---|---|
| `theme: "default"` 写死 → 图表不随主题 | `mermaidThemeFor(mode)` 映射 `dark → "dark"`、其余 `→ "default"`；`ensureMermaid()` 在**主题变化时重新 `initialize`**（只换 `theme`，**不动 `themeVariables.fontSize`** —— 那是 v2.0.1 修「多行节点文字被裁切」的锁定值，测试单独断言） |
| `svgCache` 只按源码做 key → 换主题命中旧缓存，图表保持旧色 | 缓存 key = **`<theme>::<src>`**（`mermaidCacheKey`）；`ensureMermaid` 换主题时**清空缓存** |
| 换主题后已渲染的图表要**重画**（仅改 CSS 不够） | 新增单一广播点：`session.applyTheme` 末尾 `notifyThemeChanged(themeId, mode)`（`window` 上的 `CustomEvent`，`detail = { themeId, mode }`）→ `mermaid-view` 的活动图表按 `registerMermaidInvalidator` 登记表逐个重渲染；**容器已断开时自动注销**；单个回调抛错被隔离，不阻断其它图表 |

Mermaid 的 NodeView 不是 React 组件（不订阅 store），故用 DOM 事件做**单向通知**，避免「组件 → store」的反向依赖；事件名与 `detail` 形态在 `session.ts` 导出（唯一真值）。

### 5.2 KaTeX

**裁决：跟随主题**（`04` §5.2 建议项），**不新增 token 族**：
- 现有 `--content-math` 在明暗两块都定义为 `var(--text)`（`App.css`），KaTeX 官方样式多为 `currentColor` 继承 → 公式颜色自动随 `--text` 翻转；
- 自研/第三方主题可覆盖 `--content-math` 做更精细的配色，无需改应用代码；
- **证据**：E2E 断言「同一公式在明 vs 技术（暗）下的**计算颜色不同**」（`tests/e2e/theme-builtin-226.spec.ts`）。

### 5.4 正文字体：新增 `--content-font`（复核阻塞项修复）

**问题**：`--editor-font` 的真实语义是**源码模式（CodeMirror host）字体**（唯一消费点 `src/lib/codemirror-shared.ts`，S17 已把这条口径断言化），阅读视图的字形来自 `App.css` 的 `:root { font-family: … }`（未 token 化）→ 自研主题**改不动阅读区字形**，`builtin:sepia` 的「衬线正文」名不副实；而那条 E2E 断言的是 **token 文本**，正文是衬线还是无衬线都会通过。

**修法（对齐设计意图：暖色阅读风要真的衬线）**：
1. 新增 **content 级 token `--content-font`**（进白名单 `content` 层；`--content-` 前缀本就允许）；
2. `App.css` 两块基线**同值**定义（取原 `:root { font-family }` 同一栈 → **零视觉变化**），并由 `.editor-scroll .milkdown { font-family: var(--content-font) }` 消费（主题层覆盖自定义属性，优先级链不变）；
3. `builtin:sepia` 改为覆盖 `--content-font`（衬线栈），**不再动 `--editor-font`**（源码模式保持等宽/无衬线，语义分离）；
4. **断言改成落在渲染结果上**（这是复核的核心诉求）：E2E 取 `.editor-scroll .milkdown` 的**计算 `font-family`** → 含 `Georgia` 且与 `builtin:light` 基线**不同**；同时断言 `--editor-font` 解析值仍为系统栈、**不含 Georgia**（源码模式不动）。

### 5.3 代码块（G1）

容器（底色/边框/圆角）归主题（`--content-*` / `--code-block-*`），语法高亮归 `codeBlockTheme`（元素级 `data-code-theme`）；主题里的 `.cm-*` / `.CodeMirror-*` 由 `#306` 兼容层**显式丢弃**（`#308` 的预装第三方主题同受此约束）。本批未改这段链路，只回归确认。

## 6. 证据汇总

| 验收项（`04` §7 / #226） | 证据 |
|---|---|
| 自研主题 ≥4、与 `#308` 合计 ≥6 | §1（4 + 6 = 10 个 themeId） |
| 每套主题有静态断言（token 完整性） | §3 的 7 类断言（`theme-builtin.test.ts`） |
| 核心元素与 UI 视觉一致、无漏覆盖 | 主题只覆盖 token；`tests/styles` 的 S9 零硬编码 / S17 `.cm-*` 禁令 / S2 token 双块 / S15 注入函数 / S13 层包裹 全绿 |
| PNG / HTML / PDF 跟随主题 | §4（单测 12 条）；PNG 侧另由既有导出 E2E 覆盖 |
| Mermaid 随主题重渲染、缓存不缺味 | §5.1（单测：映射 / 缓存 key / 广播；含「单回调抛错隔离」） |
| KaTeX 跟随 | §5.2（E2E 计算颜色断言） |
| 主题切换 UX（内置分组 / 成对变体 / 不可移除） | E2E `theme-builtin-226.spec.ts` **5/5** |
| 全量单测 + E2E + build | 见 PR 门禁（`vitest` / `cargo` / Playwright / `check:build-layers`） |

## 7. 本批已知边界与后续

| # | 项 | 说明 |
|---|---|---|
| N1 | ~~`asset.localhost` 背景图与 `html2canvas`~~ | **已闭环（#348 真机实测）**：**不丢图** —— asset 协议响应自带 `Access-Control-Allow-Origin`，`useCORS: true` 已足够；**不要**改 `allowTaint`（污染 canvas ⇒ `toBlob` 抛 SecurityError）。证据：`scripts/probe-asset-bg-export.mjs` 判定通过（exit 0）+ E2E `E7` + 单测参数不变量。探针退出码表与判定顺序见 §4，源级守卫 `tests/unit/asset-bg-probe.test.ts`（#350）；结论绑定 `tauri 2.11.5`，**升级 tauri 后须重跑探针确认 exit 0**（#351） |
| N2 | Mermaid 主题变化 = **全量重渲染**活动图表 | 长文档（数十张）会有一次集中开销；现有懒渲染/空闲队列/占位高度不变，缓存按主题分桶后不会来回抖。若实测卡顿，可改成「仅重渲染视口内 + 滚到再渲染」 |
| N3 | 视觉回归仍以**源级静态断言 + 行为断言**为主 | 未引入 screenshot diff：固定容器尺寸下的截图基线在 CI 上跨平台不稳（字体/渲染差异），收益与维护成本不划算；如需，建议单独开 issue 引入并配平台별基线 |
| N4 | 自研主题的「四类风格」覆盖 4 套 | 更高对比的暗色变体（`builtin:contrast-dark`）与更多阅读风主题可后续追加，机制已就绪（加一条 `BUILTIN_SELF_THEMES` 记录 + 断言自动覆盖） |
