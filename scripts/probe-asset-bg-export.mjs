// #348 真机探针：在**打包形态**（frontendDist + CSP + assetProtocol）的 WebView2 里实测
// 「`convertFileSrc` 产出的 asset URL 作为 **CSS 背景图**，交给 `html2canvas(useCORS: true, 未开 allowTaint)`
// 时，导出图里到底有没有这张背景图」——即 `docs/theme-builtin-226.md` §4（判定结论与退出码表）/ §7 N1 那一条。
//
// 为什么单测/E2E 覆盖不了：
//   `asset.localhost` 是 Tauri 的 asset 协议 host。浏览器 dev 模式下该 host 根本不存在，
//   `#306` G7-b 改写产物（`http://asset.localhost/<encodeURIComponent(path)>`）在那里连不上；
//   而且「asset 协议响应是否带 `Access-Control-Allow-Origin`」由 Rust 侧（tauri crate）注入，
//   前端造不出来。所以只能用**真机 + 打包形态**实测。
//
// 本探针不改仓库里任何主题：它直接按 `exporter.ts:250-270` 的三层离屏结构造一块
// 「带背景图」的卡片（内联 style + 样式表规则各一遍），背景 URL 用
// `window.__TAURI_INTERNALS__.convertFileSrc(abs)` 产出 ——与生产链路 `store/theme.ts` 的
// `toAssetUrlSafe()` 是**同一个 URL 生产者**（唯一差异是探针自造 CSS 而非走 `#306` 改写，
// 那一步的产物已由 `tests/theme/typora-rewrite.test.ts` 锁住：同样是 `http://asset.localhost/<encodeURIComponent>`）。
//
// 跨源头判据只用 `<img crossOrigin="anonymous">`（html2canvas 的加载器就是这么取图的）：
//   `fetch` 那条在打包形态下**注定失败**，但原因是 **CSP 的 connect-src** —— 本页 CSP 未声明
//   `connect-src` ⇒ 回落 `default-src 'self'`，而 asset 协议只在 `img-src` 里放行。
//   实测（tmp 诊断 + 本探针的 `cspBlocked` 字段）已确认该失败会带上 `connect-src` 违规归因，
//   不会被误读成「CORS 缺失」。
//   但 fetch 必须带 **5s 超时**（#350）：CSP 拦是「立刻拒绝」，而一换 CSP 配置 / 换 tauri 版本 /
//   手工改 scope，「asset 协议既不拒绝也不响应」就会让裸 fetch 永久挂起 —— `page.evaluate`
//   再也返回不了，连退出码都拿不到。超时落在 `corsFetch.timeout`，与 `cspBlocked` 分开归因
//   （超时说明「没响应」，对「是否 CORS 缺失」没有任何判定力）。
//
// 用法（四条命令）：
//   1) npx tauri build --debug --no-bundle
//      （⚠️ 必须走 CLI：`cargo build` 的 debug 产物按 devUrl 加载，不带 CSP —— 见 probe-asset-csp.mjs 头注释）
//   2) $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222"
//      Start-Process src-tauri\target\debug\inklingmd.exe
//   3) Copy-Item src-tauri\icons\32x32.png "$env:APPDATA\com.inklingmd.editor\probe-bg-<新名字>.png"
//      （静态 scope 内；**每次换新文件名**，避免命中上次缓存。探针图中心像素不能是纯品红 #ff00ff）
//   4) node scripts/probe-asset-bg-export.mjs "$env:APPDATA\com.inklingmd.editor\probe-bg-<新名字>.png"
//
// 退出码（口径固定，文档与本文件一致）：
//   0 判定**通过**：三条对照成立 + asset 背景图被正常画进导出画布（N1 疑点不成立）
//   1 用法/环境错（缺参数、CDP 连不上、找不到应用页、找不到 html2canvas UMD 产物）
//   2 自检失败：对照不成立，本轮**结论无效** ——
//     · 对照 A（data URL 背景）：**必须**被画上，否则采样/渲染姿势本身有问题；
//     · 对照 B（指向不存在文件的 asset URL）：**必须**没被画上，否则采样分辨不出「静默丢图」；
//     · 探针图中心像素 ≈ 品红（标记色）：无法与「没画上」区分，换图重跑。
//   3 页面是 devUrl 形态（`http://localhost:1420/`）⇒ 不带 CSP，不是本次要评测的形态
//   4 判定**失败**：背景图**没被画进导出画布** —— 静默丢图复现（JSON 的 `verdict` 给出归因）
//
// 实测结论（2026-10-16，本机 Windows / WebView2 Edg 120 / tauri 2.11.5）：
//   **判定通过（exit 0）** —— `asset` 背景图（内联与样式表两种声明）都被正常画进画布，
//   采样值 [38,35,38] ≈ 探针图中心 [35,35,35]（容差 30），对照 B 为标记色 [255,0,255]。
//   ⇒ N1 的「可能被 CORS 静默跳过」在真机打包形态下**不成立**；`useCORS: true` 已足够，
//   不应改成 `allowTaint`（那会污染 canvas，让 `toBlob` 直接抛 SecurityError）。
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const absPath = process.argv[2];
const port = process.argv[3] ?? "9222";
if (!absPath) {
  console.error(
    "用法：node scripts/probe-asset-bg-export.mjs <绝对文件路径> [CDP 端口=9222]",
  );
  process.exit(1);
}

const H2C = resolve(process.cwd(), "node_modules/html2canvas/dist/html2canvas.min.js");
if (!existsSync(H2C)) {
  console.error(`✗ 找不到 html2canvas UMD 产物：${H2C}（请先 npm install）`);
  process.exit(1);
}

// 探针图以 data URL 形式同时送进页面：用来在**同一张图**上取「期望中心像素」，
// 避免「探针图中心是什么颜色」依赖外部约定。
const dataUrl = `data:image/png;base64,${readFileSync(absPath).toString("base64")}`;

let browser = null;
async function finish(code) {
  if (browser) await browser.close().catch(() => {});
  process.exit(code);
}

browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
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
if (/localhost:1420/.test(page.url())) {
  console.error(
    `✗ 页面是 devUrl 形态（${page.url()}）—— 不带 CSP，不是本次要评测的形态；` +
      "请按头注释用 `npx tauri build --debug --no-bundle` 重新构建后再跑。",
  );
  await finish(3);
}

// 注入**仓库内同一版本**的 html2canvas（198KB UMD，与 package.json 的 ^1.4.1 一致）。
// ⚠️ 打包形态带 CSP（`script-src 'self' + 若干 hash`，无 `unsafe-inline`/`unsafe-eval`）：
// 实测 `page.addScriptTag({ content })` **会被 CSP 拒绝**，所以这里按强度依次降级，
// 最后一条走 CDP 的 `Page.addScriptToEvaluateOnNewDocument`（调试器级注入，不受页面 CSP 约束）。
async function injectHtml2Canvas(page, source) {
  const ok = () => page.evaluate(() => typeof window.html2canvas === "function");
  const tried = [];
  try {
    await page.addScriptTag({ content: source });
    if (await ok()) return "addScriptTag(content)";
  } catch (e) {
    tried.push(`addScriptTag: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
  }
  try {
    await page.evaluate(source);
    if (await ok()) return "page.evaluate(source)";
  } catch (e) {
    tried.push(`evaluate: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  if (await ok()) return "CDP addScriptToEvaluateOnNewDocument + reload";
  throw new Error(`无法注入 html2canvas：${tried.join(" | ")}`);
}

console.log(`html2canvas 注入方式：${await injectHtml2Canvas(page, readFileSync(H2C, "utf8"))}`);

const out = await page.evaluate(
  async ({ absPath: p, dataUrl: du }) => {
    const FALLBACK = "#ff00ff"; // 「背景图没画上」的标记色（由卡片 background-color 承担）
    const SCALE = 2; // 与 exporter.ts 一致（2 倍清晰度）
    const TOL = 30; // 单通道容差：吸收浏览器色彩管理差异
    const dist = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

    const convert = window.__TAURI_INTERNALS__?.convertFileSrc;
    const assetUrl = typeof convert === "function" ? convert(p) : null;
    // 同目录下的不存在文件（仍在 asset scope 内）→ 作为「没画上」的对照
    const missingUrl = typeof convert === "function" ? convert(`${p}.probe-missing`) : null;

    // 期望中心像素：把同一张图当 data URL 画进普通 canvas 后取中心点
    const expected = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(
          Math.floor(img.naturalWidth / 2),
          Math.floor(img.naturalHeight / 2),
          1,
          1,
        ).data;
        resolve({ rgba: [d[0], d[1], d[2], d[3]], w: img.naturalWidth, h: img.naturalHeight });
      };
      img.onerror = () => reject(new Error("data URL 探针图解码失败"));
      img.src = du;
    });

    /** 复刻 exporter.ts 的三层离屏结构，只把卡片的背景图换成待测 URL。
     *  viaStyleSheet=true 时改由**样式表规则**声明（与真实主题同形态：html2canvas 读计算样式）。 */
    async function runCase(bgValue, label, viaStyleSheet = false) {
      const CLS = "probe-bg-card";
      let styleEl = null;
      const cardCss =
        `width:200px;height:200px;background-color:${FALLBACK};` +
        "background-size:100% 100%;background-repeat:no-repeat;background-position:0 0;" +
        (bgValue ? `background-image:url("${bgValue}");` : "");
      if (viaStyleSheet) {
        styleEl = document.createElement("style");
        styleEl.textContent = `.${CLS}{${cardCss}}`;
        document.head.appendChild(styleEl);
      }
      const themeRoot = document.createElement("div");
      themeRoot.setAttribute("data-theme", "light");
      themeRoot.style.cssText =
        "position:fixed;left:-99999px;top:0;width:820px;box-sizing:border-box;";
      const scroll = document.createElement("div");
      scroll.className = "editor-scroll";
      const milkdown = document.createElement("div");
      milkdown.className = "milkdown";
      const card = document.createElement("div");
      if (viaStyleSheet) card.className = CLS;
      else card.style.cssText = cardCss;
      milkdown.appendChild(card);
      scroll.appendChild(milkdown);
      themeRoot.appendChild(scroll);
      document.body.appendChild(themeRoot);

      const cr = card.getBoundingClientRect();
      const rr = themeRoot.getBoundingClientRect();
      const px = Math.round((cr.left - rr.left + cr.width / 2) * SCALE);
      const py = Math.round((cr.top - rr.top + cr.height / 2) * SCALE);

      const res = { label, sampled: null, error: null, canvas: null };
      try {
        const canvas = await window.html2canvas(themeRoot, {
          backgroundColor: "#ffffff",
          scale: SCALE,
          useCORS: true,
          logging: false,
        });
        res.canvas = [canvas.width, canvas.height];
        const d = canvas.getContext("2d").getImageData(px, py, 1, 1).data;
        res.sampled = [d[0], d[1], d[2], d[3]];
      } catch (e) {
        res.error = e instanceof Error ? e.message : String(e);
      } finally {
        themeRoot.remove();
        if (styleEl) styleEl.remove();
      }
      return res;
    }

    /** 跨源就绪信号之一：html2canvas 的加载器会给图片设 crossOrigin="anonymous" */
    const imgWithCors = (url) =>
      new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve({ ok: true, w: img.naturalWidth });
        img.onerror = () => resolve({ ok: false });
        img.src = url;
        setTimeout(() => resolve({ ok: false, timeout: true }), 8000);
      });

    // ③ 跨源头是否在位（两条独立信号；浏览器强制 CORS，骗不了）
    //   注意 `fetch` 那条在本页**注定失败**：CSP 没声明 `connect-src` → 回落 `default-src 'self'`，
    //   而 asset 只在 `img-src` 里放行 ⇒ 会被 **CSP**（不是 CORS）拦下。故用它时必须带上违规归因，
    //   否则会把「CSP 拦」误读成「CORS 缺失」。真正的 CORS 判据是下面那条 `<img crossOrigin>`。
    let corsFetch = { ok: false, note: "skipped" };
    let corsImg = { ok: false, note: "skipped" };
    if (assetUrl) {
      const violations = [];
      const onViolation = (e) =>
        violations.push({
          directive: e.effectiveDirective,
          blocked: (e.blockedURI ?? "").slice(0, 60),
        });
      document.addEventListener("securitypolicyviolation", onViolation);
      try {
        // #350：超时不可省（见头注释）。缺了它，「asset 协议无响应」会把整轮探针挂死。
        const resp = await fetch(assetUrl, {
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        });
        corsFetch = { ok: resp.ok, status: resp.status };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // 超时与「被 CSP 拦」是两种不同事实，必须分开标记：超时＝没响应，无归因力。
        const timedOut =
          /timeout|timed out|abort/i.test(msg) ||
          (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError"));
        corsFetch = timedOut
          ? {
              ok: false,
              timeout: true,
              error: msg,
              note: "诊断 fetch 超时 5s（asset 协议既不拒绝也不响应）⇒ 本条无归因力，**不是** CORS 结论",
            }
          : { ok: false, error: msg };
      }
      // securitypolicyviolation 是异步派发的：fetch 的 Promise 先 reject，事件随后才到，
      // 立刻摘监听会漏掉违规（实测踩过：漏了就会把「CSP 拦」误写成一条无归因的失败）。
      await new Promise((r) => setTimeout(r, 600));
      document.removeEventListener("securitypolicyviolation", onViolation);
      if (
        !corsFetch.ok &&
        !corsFetch.timeout &&
        violations.some((v) => /connect-src/.test(v.directive))
      ) {
        corsFetch.cspBlocked = violations;
        corsFetch.note =
          "被 CSP 拦（未声明 connect-src ⇒ 回落 default-src 'self'），本条**不是** CORS 结论";
      }
      corsImg = await imgWithCors(assetUrl);
    }

    const controlData = await runCase(du, "controlData");
    const controlNoImage = await runCase(missingUrl, "controlNoImage");
    const target = await runCase(assetUrl, "targetAsset");
    const targetSheet = await runCase(assetUrl, "targetStyleSheet", true);

    const verdict = {
      expectedRgba: expected.rgba,
      expectedSize: [expected.w, expected.h],
      fallbackRgba: [255, 0, 255, 255],
      tolerance: TOL,
      assetUrl,
      missingUrl,
      pageUrl: location.href,
    };
    const painted = (r) => !!r.sampled && dist(r.sampled, expected.rgba) <= TOL;
    const looksFallback = (r) => !!r.sampled && dist(r.sampled, [255, 0, 255, 255]) <= TOL;
    return {
      ...verdict,
      corsFetch,
      corsImg,
      controlData: { ...controlData, painted: painted(controlData) },
      controlNoImage: { ...controlNoImage, painted: painted(controlNoImage) },
      targetAsset: {
        ...target,
        painted: painted(target),
        looksFallback: looksFallback(target),
      },
      targetStyleSheet: {
        ...targetSheet,
        painted: painted(targetSheet),
        looksFallback: looksFallback(targetSheet),
      },
      imageCenterIsFallback: dist(expected.rgba, [255, 0, 255, 255]) <= TOL,
    };
  },
  { absPath, dataUrl },
);

const j = (v) => JSON.stringify(v);
console.log(
  JSON.stringify(
    {
      页面: out.pageUrl,
      探针图中心像素: out.expectedRgba,
      标记色: out.fallbackRgba,
      assetUrl: out.assetUrl,
      "③ 跨源头（fetch）": out.corsFetch,
      "③ 跨源头（img crossOrigin）": out.corsImg,
      "对照 A（data URL 背景）": out.controlData,
      "对照 B（不存在的 asset 文件）": out.controlNoImage,
      "目标 1（asset 背景图·内联 style）": out.targetAsset,
      "目标 2（asset 背景图·样式表规则，同真实主题形态）": out.targetStyleSheet,
    },
    null,
    1,
  ),
);

// 自检：对照必须一条一条成立，否则本轮结论无效
if (out.imageCenterIsFallback) {
  console.error(
    `✗ 自检失败：探针图中心像素 ${j(out.expectedRgba)} ≈ 标记色 ${j(out.fallbackRgba)}，` +
      "无法与「背景图没画上」区分；请换一张中心像素不是纯品红 #ff00ff 的 PNG 后重跑。",
  );
  await finish(2);
}
if (!out.controlData.painted) {
  console.error(
    `✗ 自检失败：对照 A（data URL 背景，必然不受 CORS 影响）**没被画上** ⇒ 采样/渲染姿势有问题，` +
      `本轮结论无效。采样值=${j(out.controlData.sampled)}，期望=${j(out.expectedRgba)}，` +
      `错误=${out.controlData.error}`,
  );
  await finish(2);
}
if (out.controlNoImage.painted) {
  console.error(
    "✗ 自检失败：对照 B（指向不存在文件的 asset URL）居然被画上了 ⇒ 采样分辨不出「静默丢图」，本轮结论无效。",
  );
  await finish(2);
}

if (out.targetAsset.painted && out.targetStyleSheet.painted) {
  console.log(
    `✓ 判定通过：asset 背景图被正常画进导出画布（内联 ${j(out.targetAsset.sampled)} / 样式表 ` +
      `${j(out.targetStyleSheet.sampled)}，期望 ${j(out.expectedRgba)}），` +
      "#226 §7 N1「是否静默丢图」的疑点在真机上**不成立**（useCORS 生效）。",
  );
  await finish(0);
}

console.error(
  `✗ 判定失败：asset 背景图**没被画进导出画布**（内联 ${j(out.targetAsset.sampled)}，样式表 ` +
    `${j(out.targetStyleSheet.sampled)}，期望 ${j(out.expectedRgba)}）—— 静默丢图复现。归因：`,
);
console.error(
  out.corsImg.ok
    ? "  跨源头在位（<img crossOrigin> 加载成功）却仍丢图 ⇒ **不是 CORS**，需继续定位（CSP/尺寸/时序）。"
    : `  跨源头缺失或加载失败（img=${j(out.corsImg)}，fetch=${j(out.corsFetch)}）⇒ 与 N1 预判一致，` +
        "应按 N1 二选一收口：① 调 html2canvas 参数；② 导出前把 asset 背景图内联为 data URL。",
);
await finish(4);
