// #309 真机探针：在**打包形态**（frontendDist ⇒ 带 CSP）的 WebView2 里实测
// 「`convertFileSrc` 产出的 asset URL 能否加载」+ 是否触发 CSP 违规。
//
// 为什么必须真机跑：dev（devUrl）不注入 CSP、E2E 跑浏览器没有 asset 协议 ⇒ CI 与单测都覆盖不到这一层。
//
// 用法：
//   1) npm run build && (cd src-tauri && cargo build)
//   2) $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222"
//      Start-Process src-tauri\target\debug\inklingmd.exe
//   3) Copy-Item src-tauri/icons/32x32.png "$env:APPDATA\com.inklingmd.editor\probe-<新名字>.png"
//      （放静态 scope 内；**每次换新文件名**，避免命中上次缓存）
//   4) node scripts/probe-asset-csp.mjs "$env:APPDATA\com.inklingmd.editor\probe-<新名字>.png"
//
// 判定：`image.ok=true` = 能加载；`violations=[]` = 没有 CSP 拦截。
// 阳性对照（`styleSheet.loaded`）：`style-src` **不含** asset，若本机 WebView 施加 CSP，
// 这一步必被拦 —— 用它区分「token 生效」与「CSP 根本没施加」。
import { chromium } from "@playwright/test";

const absPath = process.argv[2];
const port = process.argv[3] ?? "9222";
if (!absPath) {
  console.error("用法：node scripts/probe-asset-csp.mjs <绝对文件路径> [CDP 端口=9222]");
  process.exit(1);
}

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const pages = browser.contexts().flatMap((c) => c.pages());
if (!pages.length) {
  console.error("CDP 已连上但没找到页面");
  process.exit(1);
}

let page = pages.find((p) => /tauri\.localhost|index\.html|\/$/.test(p.url()));
if (!page) {
  for (const p of pages) {
    const has = await p
      .evaluate(() => typeof window.__TAURI_INTERNALS__ !== "undefined")
      .catch(() => false);
    if (has) {
      page = p;
      break;
    }
  }
}
if (!page) {
  console.error("没找到 Tauri 应用页：", pages.map((p) => p.url()).join(" , "));
  process.exit(1);
}
console.log("应用页 URL:", page.url());

const result = await page.evaluate(async (path) => {
  const violations = [];
  const onViolation = (e) => {
    violations.push({
      directive: e.effectiveDirective,
      blockedURI: (e.blockedURI ?? "").slice(0, 80),
    });
  };
  document.addEventListener("securitypolicyviolation", onViolation);

  const convert = window.__TAURI_INTERNALS__?.convertFileSrc;
  if (typeof convert !== "function") return { error: "convertFileSrc 不存在" };
  const url = convert(path);

  const img = new Image();
  const image = await new Promise((resolve) => {
    img.onload = () => resolve({ ok: true, naturalWidth: img.naturalWidth });
    img.onerror = () => resolve({ ok: false, naturalWidth: 0 });
    img.src = url;
    setTimeout(() => resolve({ ok: false, naturalWidth: 0, timeout: true }), 8000);
  });

  // 阳性对照：样式表（style-src 不含 asset）
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = url;
  const styleSheet = await new Promise((resolve) => {
    link.onload = () => resolve({ loaded: true });
    link.onerror = () => resolve({ loaded: false });
    document.head.appendChild(link);
    setTimeout(() => resolve({ loaded: false, timeout: true }), 5000);
  });
  link.remove();

  await new Promise((r) => setTimeout(r, 800));
  document.removeEventListener("securitypolicyviolation", onViolation);
  return { url, image, styleSheet, violations };
}, absPath);

console.log(JSON.stringify(result, null, 2));
await browser.close();
