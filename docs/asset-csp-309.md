# #309 asset 协议 CSP：真机实测与守卫（2026-10-14）

## 一句话结论

Windows 打包产物里 `convertFileSrc` 产出 `http://asset.localhost/C%3A%5C…`，本地图片**正常加载**；
把 `http://asset.localhost` 从 `img-src` 拿掉后**仍然正常加载且零 `securitypolicyviolation`**
⇒ **WebView2 对自定义协议请求不施加 CSP**（#309 里的第二种假设成立）。
但 **CSP 里的两个 token 仍必须常备**（见「为什么不删」），并已把三件新事实钉成断言。

## 配置现状（#310 已落，本轮加固）

```json
"csp": "default-src 'self'; img-src 'self' https: data: asset: http://asset.localhost; font-src 'self' data: asset: http://asset.localhost; style-src 'self' 'unsafe-inline';",
```

## 真机实测（方法可复现）

```powershell
npm run build                                   # 前端 dist
cd src-tauri; cargo build                       # debug 打包形态：走 frontendDist ⇒ 有 CSP
# 探针图片放进静态 scope 内的用户数据目录
Copy-Item src-tauri/icons/32x32.png "$env:APPDATA\com.inklingmd.editor\csp-probe-r3.png"
# 打开远程调试端口后启动
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222"
Start-Process src-tauri\target\debug\inklingmd.exe
node scripts/probe-asset-csp.mjs "$env:APPDATA\com.inklingmd.editor\csp-probe-r3.png"
```

探针（`scripts/probe-asset-csp.mjs`，随本 PR 入库，Playwright over CDP）在应用页里做三件事：
`convertFileSrc(abs)` → ① `new Image()` 加载并读 `naturalWidth`；② `<link rel=stylesheet>` 指向同一 URL
（**阳性对照**：`style-src` 不含 asset，若 WebView2 施加 CSP 必被拦）；③ 期间捕获 `securitypolicyviolation`。
每次都用**全新文件名**，避免命中上一次的缓存。

环境：Windows + WebView2 `Edg/120.0.2210.133`；实测 URL：`http://asset.localhost/C%3A%5CUsers%5C…`。

| 运行 | `img-src` | 文件 | `<img>` | `<link rel=stylesheet>` → asset | CSP 违规 |
|---|---|---|---|---|---|
| A | **含** `http://asset.localhost` | 全新 r3 | **ok（naturalWidth=32）** | loaded | **0** |
| B | **去掉**该 token | 全新 r2 | **ok（naturalWidth=32）** | loaded | **0** |

两行结论都必须靠 **B**（无 token）+ 阳性对照（`style-src` 也不含 asset 却仍加载）才成立；
只跑 A 无法区分「token 生效」与「CSP 根本没施加」。

## 为什么不删 token

1. **平台差异**：`asset:` 是 macOS/Linux 形态、`http://asset.localhost` 是 Windows/Android 形态；
   自定义协议请求在 **WebKit 系（WKWebView / WebKitGTK）上是会施加 CSP 的**，本机 WebView2 不拦不代表别处不拦。
2. **未来行为变更**：WebView2 的实现可能改；token 属**防御性冗余**，缺了就是静默失败（`<img>` 不抛错、只空白）。
3. #309 自身已裁定「无论哪种结论都要补」。

## 本轮新增的守卫（`tests/styles/theme-s10-csp.test.ts`，共 6 条）

1. `img-src` 含 `'self'` / `https:` / `data:` / `asset:` / `http://asset.localhost`（原有）
2. `font-src` 显式声明且含 `'self'` / `data:` / `asset:` / `http://asset.localhost`，**不含 `https:`**（原有）
3. `style-src` 保留 `'unsafe-inline'` 且 `dangerousDisableAssetCspModification` 含 `style-src`（原有）
4. **`assetProtocol.enable === true` 且 `scope` 非空**（新增）—— 上游 `convertFileSrc` 文档的第二个要求，
   少了它 token 写对也取不到内容
5. **token 形态与窗口 scheme 一致**（新增）—— `useHttpsScheme` 打开时必须补 `https://asset.localhost`
   （默认 `false`，见 `tauri-utils-2.9.3/src/config.rs:2344`；`font-src` 不含 `https:`，靠 `https:` 兜不住）
6. **判据锚定已装 SDK**（新增）—— 从 `node_modules/@tauri-apps/api/core.js` 的 `convertFileSrc` 文档里
   抽出它点名的 token（`asset:` / `http://asset.localhost`）并逐个要求出现在 CSP 里；
   上游若改口径，本用例先红

验牙（三处变异一次性注入）：`assetProtocol.enable=false` + `useHttpsScheme=true` + `img-src` 去 token
→ **4 条断言报错**（含上面 4/5/6 三条新断言），还原后全绿。

## 顺带订正的一处注释前提

`src/theme/typora/assets.ts` 原写「`style-src` 不含 asset ⇒ 任何指向 asset 的样式表都会被拦」——
本机实测**不成立**（Run B 的 `<link>` 照常加载）。**设计不变**（本地 `@import` 仍读取内联），
但理由已改为「拦截行为**平台相关**（WebKit 系会拦），不能依赖本机不拦」。

## 未做项（明确边界）

- **未在 macOS / Linux 实测**（本轮只有 Windows 机器）：那边的 `asset:` 形态与 WebKit CSP 行为属**推断**，
  依据是上游文档与 `tauri` 源码，不是本机证据。
- 未做 **release** 形态实测：CSP 取自同一份 `tauri.conf.json`，与 debug 打包形态一致；
  差异只在 devtools 与优化级别，不影响 CSP 判定。
- `assetProtocol.scope` 仍是静态 `$APPDATA/**` + `$APPLOCALDATA/**`，工作区目录靠运行时 `allowAssetDir()`
  动态放行（`#162` 的收缩方向未变）。
