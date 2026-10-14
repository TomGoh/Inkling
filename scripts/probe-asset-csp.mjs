// #309 真机探针：在**打包形态**（frontendDist + CSP）的 WebView2 里实测
// 「`convertFileSrc` 产出的 asset URL 能否加载」+ 是否触发 CSP 违规。
//
// ⚠️ 构建姿势是硬约束（PR #337 复核查出的坑，我第一版就踩了）：
//   ✅ pnpm tauri build --debug --no-bundle     ← 走 frontendDist，页面 http://tauri.localhost/ ，**带 CSP**
//   ❌ cargo build（不经 CLI）                  ← debug 下按 build.devUrl 加载 http://localhost:1420/ ，**不带 CSP**
//   两者产物同路径（src-tauri/target/debug/inklingmd.exe），光看路径分不出来 —— 所以本探针会**自检**。
//
// 自检怎么做的（#340：对照源已**内联**，不再依赖未入库的临时脚本）：
//   探针自己起一个 node:http 服务（127.0.0.1 + 系统分配端口），提供一张**不在任何允许列表里**的真 PNG
//   （仓库内 `src-tauri/icons/32x32.png`），并先 fetch 一次确认它**真的在听**（否则对照会超时、
//   有「假通过」风险）→ 再用它做阳性对照：**它必须被 CSP 拦**，否则说明本页没有 CSP、本轮无效。
//
// 用法（两条命令，对照源无需另行准备）：
//   1) pnpm tauri build --debug --no-bundle
//   2) $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222"
//      Start-Process src-tauri\target\debug\inklingmd.exe
//   3) Copy-Item src-tauri/icons/32x32.png "$env:APPDATA\com.inklingmd.editor\probe-<新名字>.png"
//      （放静态 scope 内；**每次换新文件名**，避免命中上次缓存）
//   4) node scripts/probe-asset-csp.mjs "$env:APPDATA\com.inklingmd.editor\probe-<新名字>.png"
//
// 退出码（#340 起口径固定，文档与本文件一致）：
//   0 探针正常完成（结论看 JSON 输出：`control` 被拦 + `asset.ok`）
//   1 用法/环境错（缺参数、CDP 连不上、找不到应用页、对照源起不来或不可达）
//   2 自检失败：对照**加载成功**（本页没有 CSP）或对照**超时**（无法判定 —— 不当作「被拦」，避免假通过）
//   3 页面是 devUrl 形态（`http://localhost:1420/`）⇒ 本页没有 CSP，直接拒绝出结论
// 判定：`control` 被拦（error 且非 timeout）+ `asset.ok=true`（token 在位时 asset 图能加载）；
// 把 img-src 里的 token 拿掉重建后重跑，`asset` 应变成 `ok=false` 且报 `img-src` violation。
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const absPath = process.argv[2];
const port = process.argv[3] ?? "9222";
const externalCtrl = process.argv[4] ?? null;
if (!absPath) {
  console.error(
    "用法：node scripts/probe-asset-csp.mjs <绝对文件路径> [CDP 端口=9222] [对照 URL（可选，默认自动起）]",
  );
  process.exit(1);
}

// #342：对照 PNG 按**脚本自身位置**解析 —— 此前是相对路径，从别的目录（如 `src-tauri/`）跑会抛原始
// ENOENT stack（退出码碰巧是 1，但报错不可读、与文档口径不符）。
const PNG_URL = new URL("../src-tauri/icons/32x32.png", import.meta.url);
let PNG;
try {
  PNG = readFileSync(PNG_URL);
} catch (e) {
  console.error(
    `✗ 环境错：读不到对照用的 PNG（${fileURLToPath(PNG_URL)}）：${e instanceof Error ? e.message : e}`,
  );
  process.exit(1);
}
let browser = null;
let server = null;

/** 统一出口：先收拾资源，再按退出码结束（避免遗留浏览器连接与对照源） */
async function finish(code) {
  if (browser) await browser.close().catch(() => {});
  if (server) await new Promise((r) => server.close(r));
  process.exit(code);
}

// ① 对照源：内联自起（避免「文档引用的脚本没入库 ⇒ 别人跑不起来」）
let ctrlUrl = externalCtrl;
if (!ctrlUrl) {
  server = createServer((req, res) => {
    if (req.url === "/32.png") {
      res.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" });
      res.end(PNG);
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  ctrlUrl = `http://127.0.0.1:${server.address().port}/32.png`;
}
// 先确认对照源**真的在听**：否则对照会超时，而「超时」不该被当成「被拦」（#340 的假通过风险）
// #342：预检查必须带**超时** —— 连接被拒时能干净失败，但连接被黑洞吞掉（防火墙 DROP / TCP 半开 /
// 服务假死）时裸 fetch 会**永久挂起**（CI 上会一直挂到 job 超时），与文档「不可达 ⇒ 退出码 1」不符。
try {
  const resp = await fetch(ctrlUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  const body = Buffer.from(await resp.arrayBuffer());
  if (resp.status !== 200 || !/image\/png/i.test(resp.headers.get("content-type") ?? "")) {
    throw new Error(`status=${resp.status} content-type=${resp.headers.get("content-type")}`);
  }
  console.log(`对照源已就绪：${ctrlUrl}（${body.length} bytes 的 PNG，不在任何允许列表里）`);
} catch (e) {
  const isTimeout = e instanceof Error && e.name === "TimeoutError";
  console.error(
    `✗ 对照源不可达（${ctrlUrl}）：${isTimeout ? "预检查超时 5s（连接被挂起/黑洞）—— " : ""}` +
      `${e instanceof Error ? e.message.split("\n")[0] : e}`,
  );
  await finish(1);
}

// ② 连 CDP 并选页（**排除 chrome-error**：`\/$` 会把 chrome-error://chromewebdata/ 也匹配上）
// #342 同类：连不上时给可读的环境错，而不是把 playwright 的原始 stack 抛出去
try {
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
} catch (e) {
  console.error(
    `✗ 连不上 CDP（http://127.0.0.1:${port}）：${e instanceof Error ? e.message : e}；` +
      "请确认应用已带 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=…` 启动",
  );
  await finish(1);
}
const pages = browser.contexts().flatMap((c) => c.pages());
console.log("CDP 页面：", JSON.stringify(pages.map((p) => p.url())));

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
  await finish(1);
}

// ③ devUrl 形态**先判**（#340：它必然没有 CSP ⇒ 自检必然「对照加载成功」⇒ 若放在自检之后，
//    就永远拿不到专属退出码 3，只能在 exit 2 的泛化信息里猜）
if (/localhost:1420/.test(page.url())) {
  console.error(
    `✗ 页面是 devUrl 形态（${page.url()}）—— 它不带 CSP，不能用于本判定；` +
      "请按头注释用 `pnpm tauri build --debug --no-bundle` 重新构建后再跑。",
  );
  await finish(3);
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
    ctrlUrl: ctrl,
    assetUrl: url,
    control,
    vAfterControl,
    asset,
    vAfterAsset,
    styleSheet,
    violationsTotal: violations,
  };
}, { path: absPath, ctrl: ctrlUrl });

console.log(JSON.stringify(out, null, 1));

// ④ 自检（#340：区分「被拦」与「超时」——只有前者才算自检通过）
if (/localhost:1420/.test(out.pageUrl)) {
  console.error(`✗ 页面是 devUrl 形态（${out.pageUrl}）—— 不带 CSP，拒绝出结论。`);
  await finish(3);
}
if (out.control.timeout) {
  console.error(
    `✗ 自检无法判定：对照图既没加载、也没报错（超时 8s），无法区分「被 CSP 拦」与「对照源不可达」；` +
      `当前对照源 ${ctrlUrl}。请确认对照源可达后重跑（本探针自起的对照源会先 fetch 自检，正常不会走到这里）。`,
  );
  await finish(2);
}
if (out.control.ok === true) {
  console.error(
    "✗ 自检失败：对照图（不在任何允许列表里）居然加载成功 ⇒ **本页没有 CSP**（多半是 cargo build 的 devUrl 形态）；" +
      `当前页面 ${out.pageUrl}。本轮结果不能用来判断 CSP，请按头注释用 \`pnpm tauri build --debug --no-bundle\` 重来。`,
  );
  await finish(2);
}
console.log(
  `✓ 自检通过（本页有 CSP）：对照被拦=${out.control.error === true}；asset 图 ok=${out.asset.ok}；asset 样式表 loaded=${out.styleSheet.loaded}`,
);
await finish(0);
