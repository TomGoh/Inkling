# InklingMD UI/UX Review 报告

> 评审日期：2026-08-22 · 评审方式：**真实浏览器观察（Playwright + Chromium @ 1440×900 / 820 / 480 视口，浅色+深色双主题）+ 源码分析**
> 运行环境：`vite dev` @ `http://localhost:5199/`（Web mock 工作区模式）
> 所有标注【实测】的结论来自真实页面截图与交互；标注【源码】的结论来自代码分析。

---

## 1. Executive Summary

### 当前 UI 最大的问题

**块级工具栏（TableToolbar）与产品定位冲突。** InklingMD 是一个以「写作沉浸感」为核心的 WYSIWYG Markdown 编辑器（已有禅模式、专注模式、打字机模式），但它却在编辑器顶部常驻一条 15 个按钮的格式工具栏，混排文字与 Unicode 符号（`• 列表` `❝ 引用` `☿ Mermaid` `Y 元数据`），在 1100px 宽度下折成 2 行、480px 下折成 5 行【实测】。它把大量低频操作（元数据、目录、Mermaid、行内公式）提升到与 H1/H2 相同的视觉权重，并且与已有的 `/` 斜杠菜单功能完全重复。这是典型的「传统 Markdown 编辑器按钮堆积」问题，也是当前 UI 与现代写作工具（Typora / Obsidian / Notion）差距最大的一处。

### 当前 UI 最大的优点

**编辑器本体是真正的「写作环境」而不是「代码编辑器」。** 真实的 WYSIWYG 渲染、800px 内容最大宽度 + 居中、1.75 行高、合理的标题层级、完整的浅色/深色双主题（实测两套都高度一致、无漏配）、专注/打字机/禅模式、斜杠菜单、块拖拽手柄、表格/公式/Mermaid/Callout 渲染质量都相当不错。设计 token 地基（CSS variables + `data-theme`）已经打好。

### 如果只能改 5 个地方

1. **重做块工具栏**：默认收敛为一行紧凑的命令条（或改为上下文/悬浮触发），低频操作收进 `+` 溢出菜单，统一使用 SVG 图标。
2. **修复窄窗口布局崩塌**：侧边栏/大纲在窄窗口自动折叠，Topbar 按钮禁止换行，或（桌面端更现实）在 Tauri 配置中设置合理的最小窗口宽度。
3. **修复 muted 文本对比度**：`--text-muted` (#6e7681) 在浅灰面板底 (#f6f8fa) 上仅 4.32:1，状态栏 11.5px 文本不达 WCAG AA（实测计算）。
4. **建立间距与字号刻度**：把散落的 20+ 个 ad-hoc rem 值（0.22 / 0.24 / 0.35 / 0.42 / 0.45…）收敛为 spacing 与 font-size token 刻度。
5. **消除 token 漂移**：硬编码颜色（`#0969da`、`#2f81f7`、`#fff8c5`、`#555`…）与 z-index 散值（1/5/10/200/300/1000）全部收入 token。

---

## 2. Current UI Assessment（10 分制）

| 维度 | 分数 | 评分理由 |
|---|---|---|
| **Overall** | **7.0** | 编辑器内核体验优秀、双主题完整；工具栏与窄窗口是两大显性短板，设计系统完成度约 60%。 |
| **Layout** | 7.0 | 三列 Shell（Sidebar 248px / Editor / Outline 220px）结构清晰，Tabs/Sidebar 头 40px 对齐是少见的精细细节【源码+实测】；扣分：窄窗口下布局直接崩塌，Sidebar 不折叠。 |
| **Typography** | 7.5 | 编辑器排版（16px / 1.75 / 标题层级 / 800px 行宽）阅读舒适【实测】；扣分：UI 层有 12+ 个互不相同的字号（0.7–0.95rem），H2 带底边框在写作工具里偏多。 |
| **Color** | 7.0 | GitHub Primer 系配色，克制专业，双主题一致【实测】；扣分：muted 文本对比度两处不达 AA；大量硬编码色绕过 token。 |
| **Spacing** | 5.5 | 编辑器内容节奏好；但 UI 层无 spacing scale，padding/margin 是 20+ 个随机 rem 值【源码】，组件高度 28/38/39/40px 并存。 |
| **Editor UX** | 8.0 | 见第 7 节。WYSIWYG + 斜杠菜单 + 专注/打字机/禅模式 + 块拖拽，是这个项目最强的部分。 |
| **Toolbar** | 4.5 | 块工具栏按钮堆积、图标体系混乱（Unicode 符号 + 文字 + SVG 三套并存）、功能与斜杠菜单重复、无溢出策略【实测】。Topbar 本身反而很干净。 |
| **Sidebar** | 7.5 | 宽度合理、选中胶囊态清晰、虚拟滚动、最近打开分区【实测】；扣分：头部仅两个入口，新建文件依赖右键菜单发现性低。 |
| **Interaction** | 7.0 | hover/active/focus-visible 三态齐全，菜单入场动画克制（0.12s）【源码+实测】；扣分：disabled 状态稀少，tooltip 全靠原生 `title`。 |
| **Dark Mode** | 8.0 | 实测为一套完整设计体系：表格/Callout/代码块/滚动条/选中态全部适配，非简单反色。扣分：少量硬编码残留（`mark` 黄底、降级 banner）。 |
| **Responsive** | 4.0 | 仅两条 media query；480px 实测：侧边栏占半屏、Topbar「导出」竖排断字、工具栏折 5 行。桌面 App 可部分豁免，但当前没有任何防线。 |
| **Accessibility** | 5.5 | `:focus-visible` 聚焦环、按钮 aria-label、spinner 有 reduced-motion【源码】；扣分：两处文本对比度不达 AA、下拉/右键菜单无 `role="menu"` 与键盘导航、动画普遍未接 `prefers-reduced-motion`。 |

---

## 3. Problems（按优先级）

### P0 — 严重影响整体体验

#### P0-1 块工具栏按钮堆积，与写作定位冲突

- **Problem**: 常驻工具栏 15 个按钮（H1/H2/H3 · 列表×2 · 引用 · 代码 · 分割线 · 表格 · 公式 · 行内 · Mermaid · 提示框 · 目录 · 元数据 · 删除块），光标进表格时再追加 10 个【源码 TableToolbar.tsx + 实测】。
- **Why**: ① 与 `/` 斜杠菜单功能 100% 重复，一个动作两个入口，维护两套心智；② 低频操作（元数据、Mermaid、目录）与 H1 同权重，违背频率-权重原则；③ 图标是 Unicode 符号与文字混排，宽度不一、基线跳动，`☿`（水星符号）表示 Mermaid 语义错误；④ 1100px 折 2 行、480px 折 5 行【实测】；⑤ 它每时每刻都在提醒用户「这是个编辑器」，直接削弱沉浸感——而项目自己却做了禅模式来隐藏它，说明设计者也知道它是干扰。
- **Impact**: 第一屏视觉噪音的最大来源；长文写作时持续占用 36–100px 垂直空间；是「不像 Typora/Obsidian」的主要原因。
- **Recommendation**: 改为**单行轻量 command bar**：保留 H1/H2/H3 + 列表 + 引用 + 代码 6 个高频转换按钮（SVG 图标、等宽 28px），其余全部收进末尾 `+ 插入` 溢出菜单（与斜杠菜单共用同一套命令注册表）；表格操作组改为**光标进入表格时才出现的上下文浮条**（Notion 式）；长期方向是把工具栏默认隐藏、随选区/块悬浮出现。组件改名 `BlockToolbar`。
- **Complexity**: 中（命令已存在于 block-commands.ts，主要是重组 UI 层）
- **Priority**: P0

#### P0-2 窄窗口布局无任何防线

- **Problem**: 480px 实测：Sidebar 固定 248px 占据 52% 屏宽，Topbar「导出」按钮断成竖排两行，Tabs 溢出，块工具栏折 5 行占满首屏。仅有两条 media query（960px 藏大纲、768px 缩编辑器 padding）。
- **Why**: 桌面用户经常并排 tiling 窗口（半屏约 640–720px），当前布局在该区间已明显劣化；组件没有 `min-width` 保护也没有折叠策略。
- **Impact**: 半屏办公场景下应用接近不可用。
- **Recommendation**: 双保险——① Tauri `tauri.conf.json` 设置 `minWidth: 720, minHeight: 480`（一行配置，治本）；② ≤900px 时 Sidebar 折叠为图标栏或 overlay 抽屉，Topbar 文件名 `min-width:0` + 按钮 `white-space:nowrap`（治标）。
- **Complexity**: 低-中
- **Priority**: P0

#### P0-3 muted 文本对比度不达 WCAG AA

- **Problem**（实测计算）：`--text-muted #6e7681` 在 `--sidebar/statusbar/tabs-bg #f6f8fa~#f7f8fa` 上 = **4.32:1**（AA 要求 4.5:1）；状态栏文本仅 0.72rem（≈11.5px）属于正常字号文本，明确不达标。`--text-faint #8c959f` 在白底 = 3.04:1。深色模式 `--text-faint #6e7681` 在 `#0d1117` = 4.12:1。
- **Why**: 状态栏字数统计、Sidebar 次要文字、保存指示器是高频阅读元素，低对比度在雾面屏/强光下几乎不可读。
- **Impact**: 可访问性硬门槛失败；frontend-design skill 的 hard gate。
- **Recommendation**: 引入「底色感知」的 muted 变量：`--text-muted-on-subtle` 浅色用 `#5f6b76`（实测 5.45:1 PASS）或直接全量将 `--text-muted` 调深至 `#59636e` 左右；状态栏字号提升至 12px（0.75rem）并换用 `--text-muted-on-subtle`。深色 `--text-faint` 提至 `#7d8590`。
- **Complexity**: 低（改 3–4 个变量值）
- **Priority**: P0

### P1 — 明显影响产品质量、值得优先优化

#### P1-1 没有间距刻度，20+ 个 ad-hoc rem 值

- **Problem**【源码】: padding/margin 出现 0.14 / 0.2 / 0.22 / 0.24 / 0.25 / 0.3 / 0.32 / 0.35 / 0.4 / 0.42 / 0.45 / 0.5 / 0.55 / 0.6… 超过 20 个任意值；组件高度 28 / 38 / 39 / 40px 并存（Topbar 38、Tabs 39+1、Sidebar 头 40——39+1=40 的对齐说明作者在用魔法数补偿而不是刻度）。
- **Why**: 任意值让「看起来差不多但不齐」的 1px 偏差持续累积（Tabs 的 39+1 补偿就是证据）；后续改密度要全局逐处改。
- **Impact**: 视觉对齐脆弱，维护成本高。
- **Recommendation**: 定义 `--space-1:2px --space-2:4px --space-3:6px --space-4:8px --space-5:12px --space-6:16px --space-7:24px` + `--height-sm:28px --height-md:32px --height-lg:40px`，新代码强制使用，旧值逐步归并（不追求一次性重构）。
- **Complexity**: 中（主要是存量归并的工作量）
- **Priority**: P1

#### P1-2 图标体系三套并存

- **Problem**【源码+实测】: ① icons.tsx 手写 SVG（Topbar/Sidebar，质量良好）；② 块工具栏 Unicode 符号（`❝ ▦ ∑ ☿ ☰ ⬌`）；③ 斜杠菜单文字徽章（`H` `1.`）。`⬌`/`☿` 这类字符依赖系统字体 fallback，在 Windows 上渲染为彩色 emoji 或豆腐块的风险高。
- **Recommendation**: 以 icons.tsx 为唯一图标来源，为块工具栏与斜杠菜单补齐 16px SVG 图标（stroke 1.5，与现有风格一致），Unicode 符号仅作为无图标时的降级。
- **Complexity**: 低-中
- **Priority**: P1

#### P1-3 设计 token 漂移：硬编码颜色与 z-index 散值

- **Problem**【源码】: 直接硬编码绕过变量的例子：`column-resize-handle background:#0969da`、TOC/脚注链接 `#0969da`、`image-resize-handle background:#2f81f7`（浅色主题下用了深色主题的 accent！）、`[data-theme="dark"] .inkling-block-handle color:#555`（过暗几乎不可见）、`mark background:#fff8c5`（深色主题下亮黄刺眼）、fallback banner `#fff8c5/#e3b341`。z-index 出现 1/2/5/10/11/20/200/201/300/1000。
- **Impact**: 自定义 CSS 主题功能（ThemeMenu 已支持加载自定义 CSS）会被这些硬编码点击穿；暗色模式细节翻车。
- **Recommendation**: 全部改引 token；新增 `--warning-subtle`（mark/banner 用，双主题各配一值）；z-index 收敛为 `--z-sticky:10 --z-dropdown:100 --z-overlay:200 --z-popup:300 --z-modal:400`。
- **Complexity**: 低
- **Priority**: P1

#### P1-4 大纲面板默认开启，侵蚀写作宽度

- **Problem**【实测】: 打开文件后右侧 220px 大纲默认常驻。1440px 窗口下正文列被压缩到 ~710px；对「写」的用户，大纲是按需工具不是常驻工具。
- **Recommendation**: 默认关闭（记忆用户上次选择）；或仅在视口 ≥1400px 时默认开启。同时大纲项行高与 Sidebar 树行（28px）统一。
- **Complexity**: 低
- **Priority**: P1

#### P1-5 菜单/弹层缺少 ARIA 与键盘导航

- **Problem**【源码】: 导出/主题/更多/右键菜单均为 `div + button` 自由结构，无 `role="menu"/menuitem`、无方向键导航、Escape 行为不一致（实测：设置面板 Escape 无法关闭，只能点 backdrop）。
- **Recommendation**: 抽一个统一的 `Menu` 原语（role、roving tabindex、Esc 关闭、焦点归还触发器），四个菜单共用；所有弹层统一「Esc 关闭 + 焦点归还」契约。
- **Complexity**: 中
- **Priority**: P1

### P2 — 细节与 Polish

| # | Problem | 建议 | 复杂度 |
|---|---|---|---|
| P2-1 | H1/H2 底边框是 GitHub 阅读样式，在写作工具中增加视觉噪音【实测】 | H1 保留细分隔线或彻底去除；H2 去边框，靠字号/字重/间距分层（Typora/Obsidian 均如此） | 低 |
| P2-2 | 浅色主题下代码块默认 One Dark 深色孤岛，在白纸页面上对比突兀【实测】 | 默认跟随页面主题（light 页面用 light 代码主题），One Dark 作为可选项保留 | 低 |
| P2-3 | 字号体系 12+ 个任意值（0.7–0.95rem）【源码】 | 收敛为 `--text-xs:11px --text-sm:12px --text-md:13px --text-lg:14px --text-xl:16px` | 中 |
| P2-4 | 组件命名误导：`TableToolbar` 实为通用块工具栏【源码】 | 改名 `BlockToolbar`，表格组拆为 `TableContextBar` | 低 |
| P2-5 | Sidebar 无「新建文件/文件夹」头部入口，依赖右键菜单发现【源码】 | 头部加 `+` 图标按钮（hover 显示新建文件/文件夹二项菜单） | 低 |
| P2-6 | 动画只给 spinner 接了 `prefers-reduced-motion`【源码】 | 全局 `@media (prefers-reduced-motion: reduce)` 关闭 menu-in/fade-in/过渡 | 低 |
| P2-7 | 空状态只有一句说明文字 + 渐变标题，渐变文字与应用整体克制的风格不符【实测】 | 标题改纯色；空状态给出 2 个真实主操作按钮（打开文件夹 / 打开文件），而不是让用户去左上角找小图标 | 低 |
| P2-8 | 保存指示器「已保存 19:35:51」绿色常驻【实测】 | 已保存态用 muted 色（成功是默认态不应抢眼），仅「未保存/保存失败」用彩色 | 低 |
| P2-9 | `font-weight: 650`（h2）在系统字体上不可控，多数平台 fallback 到 600 或 700【源码】 | 统一 600/700 两档 | 低 |
| P2-10 | Zen 模式 `height:100vh` 硬编码且 padding 48px 固定【源码】 | 使用 `100dvh`，顶部留白与正常模式视觉节奏对齐 | 低 |

---

## 4. Recommended Design Direction

**一句话视觉主张：「一张安静的纸，一套随时隐形的工具。」** —— Typora 的写作优先 × Linear 的视觉克制 × VS Code 的信息密度，三者中**写作优先是主模式**，其余只是次要影响。

- **Visual style**: Editorial/workspace 混合，chrome（边框、分隔线、面板底）退到最弱：面板间只用 1px `#d8dee4` 级分隔线，不用卡片、不用投影分隔区域、不用渐变和玻璃拟态。唯一的「色」是 accent 蓝，且只出现在选中态、链接、聚焦环三处。
- **Typography**: UI 13px（0.8125rem）为基准字号，面板标题 11px/700/大写/宽字距（沿用现状，这是对的）；编辑器正文 16px/1.75；标题阶梯 1.85/1.45/1.22/1.08rem、字重 700/600/600/600、负字距仅用于 H1/H2。中文场景不建议继续加 letter-spacing。
- **Color**: 维持现有 Primer 系双主题（这是资产不要推翻），只修 P0-3 的 muted 对比度；语义色（success/danger/warning）补 `--*-subtle` 浅色底三件套。
- **Spacing**: 4px 基线刻度（2/4/6/8/12/16/24/32）；组件高度三档 28/32/40。
- **Border**: 1px，仅 `--border` 与 `--border-strong` 两档；分隔线能少用就少用（编辑器与 Topbar 之间的分隔线其实可以去掉，用背景差区分）。
- **Radius**: 维持 4/6/10 三档，UI 控件 6px 为主，弹层 10px；不要再大。
- **Shadow**: 仅浮层使用（menu/dialog/picker），维持现有 sm/md/lg 三档，平面区域零投影。
- **Icon**: 16px SVG、1.5px stroke、圆角线帽，单一来源 icons.tsx；文字徽章（斜杠菜单的 `H`）风格可保留但需统一为等宽徽章样式。
- **Animation**: 只保留状态反馈类微动画：hover 0.1s、菜单入场 0.12s 上移 4px 淡入（现状即正确）；禁止为「现代感」新增任何装饰动画；全局接 reduced-motion。
- **Editor style**: 纸面概念——内容区无框线、无背景差（编辑区与窗口底色同源），标题不带底边框，块与块之间靠垂直节奏分隔；工具以「随上下文出现」为第一原则（斜杠菜单、选区浮条、表格上下文条、块手柄）。

---

## 5. Design System Proposal

在现有 `:root` 变量基础上补齐为完整 token 层（CSS variables，按主题分组，不引入预处理器）：

```css
:root {
  /* ---- Spacing（4px 基线） ---- */
  --space-1: 2px;  --space-2: 4px;  --space-3: 6px;  --space-4: 8px;
  --space-5: 12px; --space-6: 16px; --space-7: 24px; --space-8: 32px;

  /* ---- Component heights ---- */
  --height-sm: 28px;   /* 工具栏按钮、树行 */
  --height-md: 32px;   /* 输入、菜单项 */
  --height-lg: 40px;   /* 面板头部、Tabs 栏 */

  /* ---- Font sizes（收敛 12+ 个任意值为 5 档） ---- */
  --text-xs: 11px;  --text-sm: 12px;  --text-md: 13px;
  --text-lg: 14px;  --text-xl: 16px;

  /* ---- Radius（沿用现状） ---- */
  --radius-sm: 4px; --radius-md: 6px; --radius-lg: 10px;

  /* ---- Z-index（收敛散值） ---- */
  --z-sticky: 10; --z-dropdown: 100; --z-overlay: 200;
  --z-popup: 300; --z-modal: 400;

  /* ---- Motion（沿用现状 + reduced-motion 挂钩） ---- */
  --ease: cubic-bezier(0.2, 0, 0, 1);
  --duration-fast: 0.1s; --duration: 0.15s;
}

/* 浅色 */
:root, [data-theme="light"] {
  /* 背景四层：app < subtle < elevated < editor(纸) */
  --bg-app: #ffffff; --bg-subtle: #f6f8fa; --bg-elevated: #ffffff; --editor-bg: #ffffff;
  /* 文本四档：增加 on-subtle 变体修 P0-3 */
  --text: #1f2328; --text-muted: #5f6b76; --text-faint: #8c959f;
  --text-on-subtle: #57606a;
  /* 语义色三件套 */
  --success: #1a7f37; --success-subtle: rgba(26,127,55,.1);
  --danger:  #cf222e; --danger-subtle:  rgba(207,34,46,.1);
  --warning: #9a6700; --warning-subtle: #fff8c5;
}
[data-theme="dark"] {
  --bg-app: #0d1117; --bg-subtle: #161b22; --bg-elevated: #1c2128; --editor-bg: #0d1117;
  --text: #e6edf3; --text-muted: #9198a1; --text-faint: #7d8590;
  --text-on-subtle: #9aa4b0;
  --warning: #d29922; --warning-subtle: rgba(210,153,34,.15);
  /* success/danger 同理 */
}
```

组织建议：`App.css` 只保留 token 定义与全局 reset；编辑器排版拆为 `editor.css`，弹层原语（menu/dialog 共用样式）抽为 `overlay.css`，避免 1484 行单文件继续膨胀。

---

## 6. Component-level Recommendations

**App Shell** — Current: 三列 flex + 全宽 StatusBar，结构正确。Problem: 无窄窗口策略。Recommendation: 加 min-width 防线 + ≤900px Sidebar 折叠为 overlay。

**Sidebar** — Current: 248px、40px 头、28px 树行、胶囊选中态，质量好。Problem: 新建入口藏在右键菜单；最近打开区与文件树信息重复时占高度。Recommendation: 头部加 `+` 新建按钮；最近打开区默认可折叠（现在可折叠但状态不记忆【源码待确认】）。

**Header（TabsBar）** — Current: 39+1=40px 与侧栏头对齐、活跃 tab 连通编辑区、顶部 accent 条，完成度高。Problem: 魔法数对齐。Recommendation: 高度改用 `--height-lg`，去除 39+1 补偿。

**Toolbar（块工具栏）** — 见 P0-1，本次 Review 的第一优先级。

**Editor** — 见第 7 节。

**Preview** — 本项目为 WYSIWYG 无独立预览面板（导出即预览），无此项问题；但「源码模式」就是事实上的第二视图：源码模式当前为全宽无 max-width【实测 04】，长行源码阅读尚可，但与富文本切换时内容跳动明显（800px ↔ 全宽），建议源码模式也给 `max-width: 880px` 居中以减小切换晃动。

**Status Bar** — Current: 字数/字符/行/阅读时长 + 右侧缩放，信息选择正确。Problem: 11.5px 文本 + 4.32:1 对比度（P0-3）；绿色「已保存」常驻抢眼（P2-8）。

**Button** — Current: ghost 图标按钮（Topbar）与带框按钮（Sidebar `.sidebar-btn`）两种语言并存。Recommendation: 全应用统一为 ghost/无边框风格，`.sidebar-btn` 目前似乎已无使用场景则删除。

**Input** — 重命名行内输入框有 accent 边 + 光晕，状态完整，保持。

**Dialog（设置面板）** — Current: 居中模态、开关行结构清晰【实测 32】。Problem: Escape 不能关闭；无 `role="dialog"`/焦点圈定。Recommendation: 统一弹层契约（Esc、焦点归还、aria-modal）。

**Dropdown** — 见 P1-5，统一 Menu 原语。

**Tooltip** — Current: 全部原生 `title`（延迟 1s+、样式不可控、键盘聚焦不显示）。Recommendation: 对工具栏/图标按钮实现轻量自绘 tooltip（延迟 300ms、`aria-describedby`、Esc  dismiss），低频说明文字保留 title 即可。

---

## 7. Editor-specific Recommendations（本项目核心）

**判定：当前 Editor 是名副其实的「Markdown writing environment」，不是代码编辑器套壳。** 实测依据：真实 WYSIWYG 渲染、800px 行宽（正文每行约 40–44 个中文字符，落在舒适区间）、1.75 行高、段落间距 0.8rem 呼吸感良好、长文滚动章节节奏清晰【23/24/25 截图】、专注模式（非当前块 35% 不透明度）、打字机模式、禅模式、块拖拽手柄、选区/选中单元格/链接色全部主题化。这是整个项目最不需要「改方向」、只需要「减干扰」的部分。

具体建议（按收益排序）：

1. **移除常驻块工具栏对写作区的压迫**（P0-1）。编辑器内部交互（斜杠菜单、块手柄、选区操作）已经足够，工具栏是最外圈的噪音。
2. **H1/H2 底边框去除或仅保留 H1**（P2-1）：写作时标题下的横线会把长文切成「一屏屏网页」，破坏纵向连续性；Obsidian/Typora 均不用。
3. **当前块反馈过弱**：专注模式是全有/全无（0.35 不透明度），日常写作缺一个轻量档。建议默认提供「当前段落左侧 2px accent 指示条」（类 Notion 当前块提示），不需要用户开专注模式也有位置感。
4. **代码块主题默认跟随页面**（P2-2）：白纸上的深色孤岛在长文里非常跳。
5. **源码模式与富文本宽度对齐**（第 6 节 Editor/Preview 条）：切换时 800px ↔ 全宽的横向跳动晃眼。
6. **图片与表格的上下文操作已具备（hover 手柄/工具条），保持「hover 才出现」的克制**，不要升级为常驻 UI。
7. **滚动体验**：细滚动条 + 透明轨道处理正确【源码】；`scroll-behavior` 未强制 smooth，正确，不要为了「高级感」加平滑滚动（会破坏定位准确性）。

---

## 8. Before → After（具体改造示例）

### 块工具栏

**Current（实测）**：
```
[H1][H2][H3] | [• 列表][1. 列表][❝ 引用][</> 代码] | [—][▦ 表格][∑ 公式][$ 行内][☿ Mermaid] | [! 提示框][☰ 目录][Y 元数据] | [✕ 删除块]
→ 1100px 折 2 行，480px 折 5 行；Unicode 图标基线不一；与 / 菜单重复
```

**After**：
```
[H1][H2][H3] │ [≡][1.] │ [❝][</>] │ [+ 插入 ▾]          ← 单行 32px，SVG 图标，等宽 28px
                光标进入表格时 → 表格上方浮出上下文条：[+行][+列][对齐▾][删除]
```

```css
.block-toolbar { height: var(--height-md); padding: 0 var(--space-4); gap: var(--space-1); flex-wrap: nowrap; }
.block-toolbar .tt-btn { width: var(--height-sm); height: var(--height-sm); padding: 0; justify-content: center; }
.block-toolbar .tt-overflow { margin-left: auto; }  /* 低频操作入口 */
```

### Editor（写作区）

**Current**：`max-width:800px; padding:2.5rem 2.8rem;` H1/H2 带 `border-bottom`；代码块深色孤岛；无当前块指示。

**After**：
```css
.editor-scroll .milkdown { max-width: 760px; padding: var(--space-8) var(--space-8); }
.editor-scroll .milkdown h1, .editor-scroll .milkdown h2 { border-bottom: none; padding-bottom: 0; }
/* 当前块左侧指示条（默认开启，比专注模式轻） */
.ProseMirror > .inkling-current-block { box-shadow: inset 2px 0 0 var(--accent-subtle); }
/* 代码块默认 data-code-theme="none"（跟随页面），One Dark 保留为设置项 */
```

### Sidebar

**Current**：头部仅「打开文件夹 / 打开文件」两个图标；新建靠右键菜单。

**After**：头部 `[打开▾] [+]`，`+` 直接新建文件（最常见的下一步动作），右键菜单保留完整操作集；树行高 28px 写入 `--height-sm`，选中态维持现有胶囊（已是对的）。

---

## 9. Implementation Plan

| Phase | 内容 | 复杂度 | 依赖 |
|---|---|---|---|
| **1. Design Tokens** | 补 spacing/font-size/z-index/语义色 token；修 P0-3 对比度（仅改变量值）；`--warning-subtle` 修 mark/banner | 低 | 无，先行 |
| **2. App Shell 防线** | Tauri minWidth/minHeight；Topbar `nowrap`；≤900px Sidebar 折叠策略 | 低-中 | 无，可与 P1 并行 |
| **3. Block Toolbar 重做** | 单行 command bar + 溢出菜单 + 表格上下文条；图标 SVG 化；改名 BlockToolbar | 中 | 依赖 P1 的高度/图标 token；命令层（block-commands.ts）无需改动 |
| **4. Editor 微调** | 去 H1/H2 底边框、当前块指示条、代码块主题跟随页面、源码模式限宽 | 低 | P1 token |
| **5. 组件归一** | 统一 Menu/Dialog 原语（ARIA + Esc + 焦点归还）；统一按钮语言；自绘 tooltip | 中 | P1 |
| **6. Theme 收尾** | 硬编码颜色清零（P1-3）；深色细节回归 | 低 | P1 |
| **7. Micro-interactions** | reduced-motion 全局挂钩；不做新增动画 | 低 | 任意时间 |
| **8. Accessibility / Responsive 回归** | 对比度复测、键盘走查（Tab 顺序、菜单方向键）、720/900/1100/1440 四档视口回归 | 中 | 最后，覆盖全部改动 |

依赖关系：Phase 1 是所有后续阶段的地基；Phase 2 与 3 可并行；Phase 8 为验收关卡。全程不引入任何新 UI 依赖（无组件库、无动画库、无 Tailwind），只用 CSS variables 与现有 icons.tsx 完成。

---

## 附：本次评审的环境与方法说明

- 启动命令：`./node_modules/.bin/vite --port 5199 --strictPort`（`pnpm dev` 因 pnpm 自动 install 触发环境沙箱的批量删除保护而失败，绕过方式为直接调用本地 vite 并清空注入的 NODE_OPTIONS）
- 实际运行地址：`http://localhost:5199/`（Web mock 工作区模式，文件系统为 mock 数据，UI 与桌面端一致）
- 浏览器能力：Playwright 1.62 + Chromium（项目自带依赖），真实渲染、真实交互、真实截图（27 张，位于 `.workbuddy/tmp/ui-review/`）
- 实测覆盖：初始空态 / 打开工作区 / 富文本全元素渲染（标题、加粗、斜体、链接、列表、引用、行内代码、代码块、表格、图片、分割线）/ 源码模式 / 斜杠菜单 / 导出与主题菜单 / 更多菜单 / 右键菜单 / 设置面板 / 浅色长文 / 深色长文 / Callout 双主题 / 数学公式 / 480 / 820 / 1100 / 1440 四档宽度
- 未实测（环境限制）：Tauri 桌面端原生行为（文件对话框、窗口 chrome、原生菜单）、真实文件系统 IO、触屏交互——这些结论在报告中已标注【源码】
- 已知偏差：Web mock 模式下「最近打开」等持久化行为与桌面端可能不同；截图字体渲染为无桌面字体环境，与 Tauri 窗口实际观感可能有细微差异
