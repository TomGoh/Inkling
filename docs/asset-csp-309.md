# #309 asset 协议 CSP：真机实测（修正版，2026-10-14）

> 本文是**修正版**。第一版把结论写反了（原因见文末「修正记录」），核心更正一句话：
> **Windows / WebView2 对 `http://asset.localhost` 是施加 CSP 的。**

## 一句话结论

打包形态（`pnpm tauri build --debug --no-bundle`，页面 `http://tauri.localhost/`）下：

- `img-src` **含** `http://asset.localhost` → asset 图片**正常加载**（`naturalWidth=32`）；
- `img-src` **去掉**该 token → asset 图片**当场被拦**，报 `img-src` violation，`blockedURI` 就是
  `http://asset.localhost/C%3A\…`；
- `style-src` 不含 asset（现状）→ asset **样式表**被拦，报 `style-src-elem` violation。

⇒ 这两个 token 在 **Windows 今天就承重**（不是「防御性冗余 / 只为 macOS-Linux」），
`src/theme/typora/assets.ts` 里「本地 `@import` 必须读取并内联」的原注释**是对的**。

## 构建姿势是硬约束（第一版就栽在这里）

| 命令 | 页面 | CSP | 能用于本判定吗 |
|---|---|---|---|
| `cargo build`（不经 CLI） | **`http://localhost:1420/`**（`build.devUrl`） | **无** | ✗ 第一版用它 ⇒ 结论反了 |
| `pnpm tauri build --debug --no-bundle` | **`http://tauri.localhost/`** | **有** | ✓ |

两者产物**同路径**（`src-tauri/target/debug/inklingmd.exe`），光看路径分不出来 ⇒ 探针必须**自检**（下一节）。

另：Tauri CLI 会按 `assetProtocol.enable` 顺带改 `src-tauri/Cargo.toml` / `Cargo.lock`（加 `http-range` 之类依赖），
实测完记得 `git checkout --` 还原，别混进提交。

## 自检：没有它就会重犯第一版的错

用一张**不在任何允许列表里**的真 PNG 作阳性对照。**对照源由探针内联自起**（`node:http` + 系统分配端口，
提供仓库内的 `src-tauri/icons/32x32.png`），并在探针侧先 `fetch` 一次确认它**真的在听** ——
所以复现时**不需要**额外准备任何脚本或端口（#340：此前文档引用的临时对照源没入库，别人照着跑不起来）。

- 对照**必须被拦**（说明本页确实有 CSP、本判定才有意义）；
- 对照**加载成功** ⇒ 本页没有 CSP ⇒ 本轮无效；
- 对照**超时** ⇒ **不算通过**（无法区分「被 CSP 拦」与「对照源不可达」，故判无效；探针会明确报出来）。

判定顺序（#340 起固定）：**先判 devUrl 形态**（`http://localhost:1420/` ⇒ 直接拒绝）→ **再做自检** →
最后才看 asset 图。顺序很关键：devUrl 页面必然没有 CSP ⇒ 自检必然先撞「对照加载成功」，
若把自检放在前面，devUrl 的专属诊断就永远不可达（第一版就是这么把结论跑反的）。

| 退出码 | 含义 |
|---|---|
| 0 | 探针正常完成（结论看 JSON：`control` 被拦 + `asset.ok`） |
| 1 | 用法/环境错（缺参数、CDP 连不上、找不到应用页、对照源起不来或不可达） |
| 2 | 自检失败：对照加载成功（本页无 CSP）或对照超时（无法判定） |
| 3 | 页面是 devUrl 形态（`http://localhost:1420/`）⇒ 不带 CSP，拒绝出结论 |

第一版正是省了自检这一步，把「无 CSP 下的必然结果」（对照也加载、`<link>` 也 loaded）读成了「WebView2 不施加 CSP」。

## 实测数据（Windows + WebView2 `Edg/120.0.2210.133`）

| 运行 | `img-src` | 对照（不在允许列表里的真 PNG，端口由探针自定） | asset `<img>` | asset `<link rel=stylesheet>` | violations |
|---|---|---|---|---|---|
| **A** | 含 `http://asset.localhost` | **blocked + `img-src`** ✓（CSP 生效） | **ok（w=32）** ✓ | **blocked + `style-src-elem`** | 2 |
| **B** | **去掉**该 token | blocked ✓ | **blocked + `img-src`**（`blockedURI=http://asset.localhost/C%3A\…`）✗ | blocked（`style-src-elem`） | 3 |

实测 URL 形态：`http://asset.localhost/C%3A%5CUsers%5C…`（与 `#309` 的平台差异论断一致：`asset:` 是 macOS/Linux 形态）。

两次运行的两条纪律（都踩过）：

1. **每次换全新文件名**，否则可能命中上一次的缓存；
2. **Run B 必须重新构建**（`tauri.conf.json` 是编译进产物的），且**构建前要先停掉正在运行的 exe**，
   否则报 `failed to remove file … 拒绝访问 (os error 5)` —— 我第一次跑 B 就撞上，那一轮的探针结果无效。

## 复现步骤

见 `scripts/probe-asset-csp.mjs` 头注释（含对照服务、远程调试端口、探针图的放置位置与命名要求）。

## 未做项与边界

- **macOS / Linux 未实测**（那边走 `asset:` 形态）；本文结论只覆盖 Windows + WebView2。
- 未做 release 形态实测：CSP 取自同一份 `tauri.conf.json`，debug 打包形态足以判定「是否施加 CSP」。
- `assetProtocol.scope` 仍是静态 `$APPDATA/**` + `$APPLOCALDATA/**`，工作区目录靠运行时 `allowAssetDir()` 放行（`#162` 方向未变）。

## 修正记录（第一版错在哪）

| 环节 | 第一版（错） | 修正版 |
|---|---|---|
| 构建 | `cargo build` ⇒ devUrl 形态（**无 CSP**） | `pnpm tauri build --debug --no-bundle` ⇒ 打包形态（有 CSP） |
| 对照 | 无（把「无 CSP」的必然结果当结论） | 阳性对照必须被拦，否则退出码 2 判无效 |
| 结论 | 「WebView2 不施加 CSP」 | **施加**：去掉 token ⇒ asset 图当场被拦 |
| 下游 | 把 `assets.ts` **原本正确**的注释改错；doc / 测试头注释 / issue 评论都记了错结论 | 三处均按实测改回/重写；issue 里补更正说明 |
| 未变 | —— | **token 要留**（结论不变，理由更硬：本平台就拦） |
