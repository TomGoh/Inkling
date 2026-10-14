import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// #224 S10（#309/G7/G7-c）：asset 协议 CSP token 完整性。
// 该问题只在打包产物暴露（dev 无 CSP、E2E 跑浏览器非 asset 协议），CI 无法靠
// 运行时行为兜住，必须由源级静态断言保证。
//
// #309 真机实测（2026-10-14，Windows + WebView2 Edg/120.0.2210.133，debug 打包形态）：
// - 产出 `http://asset.localhost/C%3A%5C…`，`<img>` 正常加载；
// - **把该 token 从 img-src 拿掉后仍照常加载、零 `securitypolicyviolation`**（连
//   `style-src` 不含 asset 时的 `<link rel=stylesheet>` 也照常加载）⇒ **WebView2 对
//   自定义协议请求不施加 CSP**（#309 的第二种假设）；
// - 但 token **仍必须常备**：macOS/Linux 是 `asset:` 形态、WebKit 系会真拦、WebView2
//   行为可能变更 ⇒ 下面的断言一处都不放松（并把「形态随 scheme」也钉住）。
function tauriApp(): {
  security: {
    csp: string;
    dangerousDisableAssetCspModification?: unknown;
    assetProtocol?: { enable?: boolean; scope?: string[] };
  };
  windows?: { useHttpsScheme?: boolean }[];
} {
  const conf = JSON.parse(
    readFileSync(resolve(process.cwd(), "src-tauri/tauri.conf.json"), "utf8"),
  );
  return conf.app;
}

function tauriConf() {
  return tauriApp();
}

function directives(): Map<string, string[]> {
  const csp: string = tauriConf().security.csp;
  const map = new Map<string, string[]>();
  for (const part of csp.split(";")) {
    const tokens = part.trim().split(/\s+/);
    if (tokens.length) map.set(tokens[0], tokens.slice(1));
  }
  return map;
}

describe("S10 CSP asset 协议 token 完整性（G7/G7-c/#309）", () => {
  const csp = directives();

  it("img-src 同时包含两平台 asset token（asset: 与 http://asset.localhost）与 data:", () => {
    const img = csp.get("img-src") ?? [];
    expect(img).toContain("asset:");
    expect(img).toContain("http://asset.localhost");
    expect(img).toContain("data:");
    expect(img).toContain("'self'");
  });

  it("font-src 已声明且包含 'self' / data: / asset: / http://asset.localhost，但不含 https:（不放开远程字体）", () => {
    const font = csp.get("font-src");
    expect(font, "font-src 必须显式声明（否则回落 default-src 拦掉本地与 base64 字体）").toBeTruthy();
    expect(font).toContain("'self'"); // KaTeX 20 条 @font-face 走同源 /assets
    expect(font).toContain("data:");
    expect(font).toContain("asset:");
    expect(font).toContain("http://asset.localhost");
    expect(font).not.toContain("https:");
  });

  // #310 评审阻塞项 2：index.html 的内联层序 statement 会让 Tauri codegen 给该
  // <style> 注入 nonce 占位符，运行期 `replace_csp_nonce` 随即把 'nonce-…' 追加进
  // style-src；而 CSP3 规定指令里出现 nonce 时 'unsafe-inline' 失效 →
  // 所有运行时注入的 <style> 被拦（CodeMirror style-mod、自定义 CSS、mermaid 的
  // SVG 内 <style>）。故必须显式关闭 style-src 的 CSP 修改。
  // 依据：tauri-utils-2.9.3/src/html2.rs:67-77（can_modify("style-src") 门控）、
  //       tauri-2.11.5/src/manager/mod.rs:96-104（replace_csp_nonce 仅在可修改时执行）。
  it("style-src 不得进入 nonce 模式：index.html 有内联 <style> 时必须关闭 style-src 的 CSP 修改", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8").replace(
      /<!--[\s\S]*?-->/g,
      "",
    );
    expect(/<style[\s>]/.test(html), "层序 statement 必须仍在 index.html 内联（N1）").toBe(true);

    const disabled = tauriConf().security.dangerousDisableAssetCspModification;
    const styleModificationDisabled =
      disabled === true || (Array.isArray(disabled) && disabled.includes("style-src"));
    expect(
      styleModificationDisabled,
      '缺少 security.dangerousDisableAssetCspModification: ["style-src"]：层序 statement 会让 release 的 style-src 进入 nonce 模式，运行时 <style> 全部失效',
    ).toBe(true);
    expect(csp.get("style-src"), "style-src 必须保留 'unsafe-inline'").toContain(
      "'unsafe-inline'",
    );
  });

  // #309：上游 `convertFileSrc` 文档的**第二个**要求（第一个是两个 token）——
  // 「Additionally, `"enable": "true"` must be added to app.security.assetProtocol and its
  // access scope must be defined on the scope array」。少了它，token 写对也取不到内容。
  it("assetProtocol 已启用且 scope 非空（上游 convertFileSrc 文档的第二个要求）", () => {
    const ap = tauriConf().security.assetProtocol;
    expect(
      ap?.enable,
      "app.security.assetProtocol.enable 必须为 true，否则 convertFileSrc 的 URL 取不到内容",
    ).toBe(true);
    expect(
      Array.isArray(ap?.scope) && (ap?.scope?.length ?? 0) > 0,
      "assetProtocol.scope 必须至少有一条（静态 scope 覆盖用户目录；工作区目录另有运行时放行）",
    ).toBe(true);
  });

  // #309：token 的**形态**取决于窗口的 scheme 配置 ——
  // `use_https_scheme=false`（默认，见 tauri-utils-2.9.3/config.rs:2344）时 Windows 产出
  // `http://asset.localhost`；打开该开关后变成 `https://asset.localhost`，而 font-src
  // **不含** `https:` ⇒ 必须显式补 token（img-src 的 `https:` 虽能兜住，也一并要求显式）。
  it("token 形态与窗口 scheme 一致（useHttpsScheme 打开时必须补 https://asset.localhost）", () => {
    const httpsScheme = (tauriApp().windows ?? []).some((w) => w.useHttpsScheme === true);
    const expected = httpsScheme ? "https://asset.localhost" : "http://asset.localhost";
    for (const directive of ["img-src", "font-src"]) {
      expect(
        csp.get(directive),
        `${directive} 缺少与 useHttpsScheme=${httpsScheme} 对应的 token：${expected}`,
      ).toContain(expected);
    }
  });

  // #309：把**上游注释本身**当判据（不是我们抄一份清单）——已装 SDK 的 convertFileSrc
  // 文档写明「`asset:` 与 `http://asset.localhost` must be added to app.security.csp」。
  // 若将来升级 Tauri 改了口径（新增/改名 token），这里会先红，提醒回来核对。
  it("判据锚定已装 @tauri-apps/api：其 convertFileSrc 文档点名的 token 都必须在 CSP 里", () => {
    const api = readFileSync(
      resolve(process.cwd(), "node_modules/@tauri-apps/api/core.js"),
      "utf8",
    );
    const doc = api
      .split("\n")
      .find((l) => /must be added to/.test(l) && /security\.csp/.test(l));
    expect(
      doc,
      "上游注释里应有 convertFileSrc 的 CSP 要求（措辞变了就要重新核对本用例与 CSP）",
    ).toBeTruthy();
    const tokens = [...doc!.matchAll(/`([^`]+)`/g)]
      .map((m) => m[1])
      .filter((t) => /asset/.test(t));
    expect(tokens.length, `上游点名的 asset token：${tokens.join(" / ")}`).toBeGreaterThanOrEqual(2);
    for (const token of tokens) {
      for (const directive of ["img-src", "font-src"]) {
        expect(csp.get(directive), `${directive} 缺少上游点名的 token：${token}`).toContain(token);
      }
    }
  });
});
