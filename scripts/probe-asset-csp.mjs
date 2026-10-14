// #309 真机探针：在**打包形态**（frontendDist + CSP）的 WebView2 里实测
// 「`convertFileSrc` 产出的 asset URL 能否加载」+ 是否触发 CSP 违规。
//
// ⚠️ 构建姿势是硬约束（PR #337 复核查出的坑，我第一版就踩了）：
//   ✅ pnpm tauri build --debug --no-bundle     ← 走 frontendDist，页面 http://tauri.localhost/ ，**带 CSP**
//   ❌ cargo build（不经 CLI）                  ← debug 下按 build.devUrl 加载 http://localhost:1420/ ，**不带 CSP**
//   两者产物同路径（src-tauri/target/debug/inklingmd.exe），光看路径分不出来 —— 所以本探针会**自检**：
//   先用一个**不在任何允许列表里**的对照 PNG（默认 http://127.0.0.1:8899/32.png，配 tmp/pngserver.mjs）验证
//   「本页确实会拦东西」。对照图**加载成功 ⇒ 本页没有 CSP ⇒ 这轮结论无效**（退出码 2）。
//
// 用法：
//   1) pnpm tauri build --debug --no-bundle
//   2) node tmp/pngserver.mjs &                      # 对照 PNG 源（127.0.0.1:8899）
//   3) $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222"
//      Start-Process src-tauri\target\debug\inklingmd.exe
//   4) Copy-Item src-tauri/icons/32x32.png "$env:APPDATA\com.inklingmd.editor\probe-<新名字>.png"
//      （放静态 scope 内；**每次换新文件名**，避免命中上次缓存）
//   5) node scripts/probe-asset-csp.mjs "$env:APPDATA\com.inklingmd.editor\probe-<新名字>.png"
//
// 判定：`control.blocked=true`（本页有 CSP）+ `asset.ok=true`（token 在位时 asset 图能加载）；
// 把 img-src 里的 token 拿掉后重跑，`asset` 应变成 `ok=false` 且报 `img-src` violation。
import { chromium } from "@playwright/test";

const absPath = process.argv[2];
const port = process.argv[3] ?? "9222";
const controlUrl = process.argv[4] ?? "http://127.0.0.1:8899/32.png";
if (!absPath) {
  console.error("用法：node scripts/probe-asset-csp.mjs <绝对文件路径> [CDP 端口] [对照 URL]");
  process.exit(1);
}

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const pages = browser.contexts().flatMap((c) => c.pages());
console.log("CDP 页面：", JSON.stringify(pages.map((p) => p.url())));

// 选页：**排除 chrome-error**（上一次踩坑：`\/$` 把 chrome-error://chromewebdata/ 也匹配上了），
// 优先真正的应用页（tauri.localhost = 打包形态；localhost:1420 = devUrl 形态，会被自检拦下）。
const appPage = (p) =>
  !p.url().startsWith("chrome-error:") &&
  !p.url().startsWith("devtools:") &&
  /^(https?|tauri):/.test(p.url());
const page =
  pages.find((p) => appPage(p) && /tauri\.localhost/.test(p.url())) ??
  pages.find((p) => appPage(p) && /localhost:1420|index\.html|\/$/.test(p.url())) ??
  pages.find(appPage) ??
  null;
if (!page) {
  console.error("没找到可评测的应用页；CDP 页面列表见上");
  await browser.close();
  process.exit(1);
}

const out = await page.evaluate(async ({ path, ctrl }) => {
  const violations = [];
  const onViolation = (e) =>
    violations.push({
      directive: e.effectiveDirective,
      blocked: (e.blockedURI ?? "").slice(0, 70),
      source: e.sourceFile ? String(e.sourceFile).slice(-40) : null,
    });
  document.addEventListener("securitypolicyviolation", onViolation);

  const convert = window.__TAURI_INTERNALS__?.convertFileSrc;
  const url = typeof convert === "function" ? convert(path) : null;

  const loadImg = (src, ms = 8000) =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ ok: true, w: img.naturalWidth });
      img.onerror = () => resolve({ ok: false, w: 0, error: true });
      img.src = src;
      setTimeout(() => resolve({ ok: false, w: 0, timeout: true }), ms);
    });

  // ① 阳性对照：不在允许列表里的真 PNG。**它必须被拦**，否则本页没有 CSP、整轮无效。
  const control = await loadImg(ctrl);
  const vAfterControl = violations.slice();

  // ② 目标：asset URL 的图片
  const asset = url ? await loadImg(url) : { ok: false, error: "no convertFileSrc" };
  const vAfterAsset = violations.slice();

  // ③ style-src 对照：asset 样式表（style-src 不含 asset ⇒ 有 CSP 时必被拦）
  let styleSheet = { loaded: false, note: "skipped" };
  if (url) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    styleSheet = await new Promise((resolve) => {
      link.onload = () => resolve({ loaded: true });
      link.onerror = () => resolve({ loaded: false, error: true });
      document.head.appendChild(link);
      setTimeout(() => resolve({ loaded: false, timeout: true }), 5000);
    });
    link.remove();
  }

  await new Promise((r) => setTimeout(r, 800));
  document.removeEventListener("securitypolicyviolation", onViolation);
  return {
    pageUrl: location.href,
    isChromeError: location.protocol === "chrome-error:",
    ua: navigator.userAgent.slice(0, 90),
    assetUrl: url,
    control,
    vAfterControl,
    asset,
    vAfterAsset,
    styleSheet,
    violationsTotal: violations,
  };
}, { path: absPath, ctrl: controlUrl });

console.log(JSON.stringify(out, null, 1));

const controlBlocked = out.control.ok === false;
if (!controlBlocked) {
  console.error(
    "✗ 自检失败：对照图（不在任何允许列表里）居然加载成功 ⇒ **本页没有 CSP**（多半是 cargo build 的 devUrl 形态）；" +
      `当前页面 ${out.pageUrl}。本轮结果不能用来判断 CSP，请按头注释用 \`pnpm tauri build --debug --no-bundle\` 重来。`,
  );
  await browser.close();
  process.exit(2);
}
if (/localhost:1420/.test(out.pageUrl)) {
  console.error(
    `✗ 页面是 devUrl 形态（${out.pageUrl}）—— 它不带 CSP，不能用于本判定；请用 pnpm tauri build --debug --no-bundle。`,
  );
  await browser.close();
  process.exit(3);
}
console.log(
  `✓ 自检通过（本页有 CSP）：对照被拦=${controlBlocked}；asset 图 ok=${out.asset.ok}；asset 样式表 loaded=${out.styleSheet.loaded}`,
);
await browser.close();
