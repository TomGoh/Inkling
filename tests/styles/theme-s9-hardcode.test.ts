import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  readFixture,
  expandEntries,
  readSrc,
  s9AllowViolations,
  s9Offenders,
} from "../helpers/theme-css";

// #224 S9 + 未登记守卫 + 白名单同步。
describe("S9 零硬编码色 + 入口登记守卫 + 白名单同步（#223/#224）", () => {
  const fixture = readFixture();

  it("S9 tokenDefinitionFiles 内所有 hex/rgba 只出现在 --token 定义行（先剥注释口径）", () => {
    for (const rel of expandEntries(fixture.tokenDefinitionFiles)) {
      const offenders = s9Offenders(readSrc(rel));
      expect(offenders, `${rel} 存在非 token 定义行的硬编码色值：\n${offenders
        .map((o) => `  L${o.line}: ${o.text}`)
        .join("\n")}`).toEqual([]);
    }
  });

  // #312 项 1：豁免从「只登记 marker 名」升级为**点级**（marker + 文件 + 次数），
  // 对齐 S15 `innerHTMLAllowlist`。旧形态下「抄一行 `/* s9-allow: x *\/`」即可静默通过。
  // 标记判定按**原文**匹配、不剥注释：注释里出现字面量也算一次使用（故注释不能写该字面量）。
  it("s9-allow 豁免为点级（marker+文件+次数）且与磁盘实际一致：新增一处即失败", () => {
    const scanned = expandEntries(fixture.tokenDefinitionFiles).map((rel) => ({
      rel,
      raw: readSrc(rel),
    }));
    expect(s9AllowViolations(scanned, fixture.s9AllowMarkers)).toEqual([]);
  });

  // 负例（#312 验收：故意构造违规输入必须失败）—— 走与上面同一条判据
  describe("s9AllowViolations 点级对账的负例", () => {
    const REG = [{ marker: "issue-x9", file: "src/App.css", count: 1 }];

    it("标了但没登记 → 失败", () => {
      const v = s9AllowViolations([{ rel: "src/App.css", raw: "/* s9-allow: issue-x9 */" }], []);
      expect(v.length).toBe(1);
      expect(v[0]).toContain("未登记豁免");
    });

    it("次数不符（新增一处）→ 失败", () => {
      const raw = "/* s9-allow: issue-x9 */\n/* s9-allow: issue-x9 */";
      const v = s9AllowViolations([{ rel: "src/App.css", raw }], REG);
      expect(v[0]).toContain("实际 2 次、登记 1 次");
    });

    it("次数不符（删掉一处）→ 同样失败（豁免不得多挂）", () => {
      const v = s9AllowViolations([{ rel: "src/App.css", raw: "a{}" }], REG);
      expect(v[0]).toContain("已过期");
    });

    it("同 marker 换文件 → 失败（点级绑定文件）", () => {
      const v = s9AllowViolations(
        [{ rel: "src/components/Sidebar/Sidebar.css", raw: "/* s9-allow: issue-x9 */" }],
        REG,
      );
      expect(v[0]).toContain("未登记豁免");
    });

    it("完全一致 → 通过", () => {
      expect(
        s9AllowViolations([{ rel: "src/App.css", raw: "/* s9-allow: issue-x9 */" }], REG),
      ).toEqual([]);
    });
  });

  // #312 项 2：色值正则盲区补齐的负例（hsl / 命名色 / color-mix / oklch 都必须被拦下）
  describe("S9 色值形态覆盖（#312 项 2 负例）", () => {
    it.each([
      "a { color: hsl(210 50% 50%) }",
      "a { color: hsla(210, 50%, 50%, 0.5) }",
      "a { color: color-mix(in srgb, red 50%, blue) }",
      "a { color: oklch(0.7 0.1 200) }",
      "a { color: oklab(0.7 0.1 200) }",
      "a { color: lab(50% 40 59.5) }",
      "a { color: lch(52.2% 72.2 50) }",
      "a { color: color(display-p3 1 0 0) }",
      "a { color: orange }",
      "a { background: rebeccapurple }",
      // #327 补漏：Color 4/5 与其它函数族（此前全部逃逸）
      "a { color: hwb(210 0% 0%) }",
      "a { color: device-cmyk(0 1 0 0) }",
      "a { color: color-contrast(var(--x) vs red, blue) }",
      "a { color: light-dark(white, black) }",
      // #332 补漏：属性白名单外的命名色（判据反转后**默认全判**，不再逐个列颜色属性）
      "a { -webkit-text-fill-color: gold }",
      "a { -webkit-text-stroke-color: red }",
      "a { -webkit-tap-highlight-color: red }",
      "a { text-decoration: underline gold }",
      "a { text-emphasis-color: red }",
      "a { border-inline-start-color: red }",
      "a { border-block-end: 1px solid gold }",
      "a { caret: red }",
    ])("拦截非 token 行上的色值：%s", (css) => {
      expect(s9Offenders(css).length).toBe(1);
    });

    it.each([
      "a { color: var(--text) }",
      "a { background: transparent }",
      "a { border-color: currentColor }",
      "a { color: inherit }",
      "a { background: none }",
      "a { color: var(--gold-token) }", // 自定义属性名里带颜色词 → 不得误判
      "  --gold: #ffd700;", // token 定义行 → 放行
      // #327 收误报：颜色词出现在**字符串 / 非颜色属性**里，都不是硬编码色
      '.p::after { content: "gold"; }',
      ".p { font-family: Linen, serif; }",
      ".p { animation: snow 2s; }",
      ".p { width: calc(tan(1rad) * 10px); }",
      ".p { transition-duration: 2s; color: var(--text); }",
      // #332 收误报：色值**写在引号字符串或 url() 里**（三条判据统一剥掉后不该报）
      'a { content: "rgb(1, 2, 3)"; }',
      'a { content: "#fff"; }',
      'a { background: url("data:image/svg+xml,<svg fill=\'rgb(1,2,3)\'/>") }',
      "a { background: url(icon.svg#fff) }",
      "a { background-image: url(theme/gold.png) }",
      'a { background-image: url("icons/foo).svg") }', // URL 内含 `)`，剥完不该吃掉后续
      // #335 Codex P2②：值语法为 <custom-ident> 的属性，命名色词是合法标识符
      "a { container-name: red }",
      "a { view-transition-name: blue }",
      "a { anchor-name: gold }",
      "a { view-transition-class: red }", // Codex 第二轮 P2
      "a { timeline-scope: gold }",
      "a { scroll-timeline-name: linen }",
      "a { animation-timeline: red }",
    ])("不误报：%s", (css) => {
      expect(s9Offenders(css)).toEqual([]);
    });

    // 后缀兜底不得把它该管的东西也放掉：`-name/-class/-scope` 之外的属性照旧要判
    it("后缀兜底不越界：这些看起来像但不属于该族的属性仍要判", () => {
      expect(s9Offenders("a { color: red }").length).toBe(1);
      expect(s9Offenders("a { border-color: gold }").length).toBe(1);
      expect(s9Offenders("a { text-emphasis-color: linen }").length).toBe(1);
      expect(s9Offenders("a { grid-column-end: 3 }")).toEqual([]); // 无颜色词，本来就不该报
    });

    // #335 Codex P2①：URL 里的 `)` 曾让扫描在 URL 内部截断、错配引号，把**后续真实色值**吃掉
    it("URL 内含 `)` 时不得吃掉后续真实色值（Codex 复核给的例子）", () => {
      const css = 'a { background-image: url("icons/foo).svg"); color: #fff; content: "ok"; }';
      expect(s9Offenders(css).length).toBe(1);
      expect(s9Offenders(css)[0].text).toContain("#fff");
    });
  });

  it("未登记守卫：src 下所有 .css 必须被 tokenDefinitionFiles 覆盖（新增样式入口须登记）", () => {
    const registered = new Set(expandEntries(fixture.tokenDefinitionFiles));
    // 直接从磁盘枚举 src 下全部 CSS
    const actual = new Set<string>();
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name.startsWith(".")) continue;
        const full = resolve(dir, name);
        const st = statSync(full);
        const prefix = resolve(process.cwd()) + "/";
        if (st.isDirectory()) walk(full);
        else if (st.isFile() && name.endsWith(".css"))
          actual.add(full.slice(prefix.length).split("\\").join("/"));
      }
    };
    walk(resolve(process.cwd(), "src"));
    const unregistered = [...actual].filter((f) => !registered.has(f));
    expect(unregistered, `未登记的样式入口：${unregistered.join(", ")}`).toEqual([]);
  });

  it("白名单 src/theme/token-whitelist.json 与 App.css 定义保持同步（分类无遗漏）", () => {
    const whitelist = JSON.parse(
      readFileSync(resolve(process.cwd(), "src/theme/token-whitelist.json"), "utf8"),
    ) as {
      base: string[];
      shell: string[];
      content: string[];
      existingNamesByLayer: { shell: string[]; content: string[] };
    };
    const appCss = readSrc(fixture.themeBlocks.file);
    const appTokens = new Set(
      [...appCss.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]),
    );
    const listed = new Set([
      ...whitelist.base,
      ...whitelist.shell,
      ...whitelist.content,
    ]);
    // App.css 定义的每个 token 都必须在白名单中有归属
    const missing = [...appTokens].filter((t) => !listed.has(t));
    expect(missing, `白名单缺少 token 归属：${missing.join(", ")}`).toEqual([]);
    // 白名单不应有 App.css 未定义的幽灵 token
    const ghosts = [...listed].filter((t) => !appTokens.has(t));
    expect(ghosts, `白名单存在未定义 token：${ghosts.join(", ")}`).toEqual([]);
    // 分类自洽：shell 桶 = --shell-* 前缀 + existingNamesByLayer.shell（不改名的外壳层现有名）
    const shellExisting = new Set(whitelist.existingNamesByLayer.shell);
    for (const t of whitelist.shell) {
      expect(
        t.startsWith("--shell-") || shellExisting.has(t),
        `shell 桶分类错误：${t}`,
      ).toBe(true);
    }
    // content 桶 = --content-*/--code-block-* 前缀 + existingNamesByLayer.content
    const contentExisting = new Set(whitelist.existingNamesByLayer.content);
    for (const t of whitelist.content) {
      expect(
        t.startsWith("--content-") || t.startsWith("--code-block-") || contentExisting.has(t),
        `content 桶分类错误：${t}`,
      ).toBe(true);
    }
    // 三桶互斥（同一 token 不得跨桶）
    const seen = new Set<string>();
    for (const t of [...whitelist.base, ...whitelist.shell, ...whitelist.content]) {
      expect(seen.has(t), `token 跨界重复归属：${t}`).toBe(false);
      seen.add(t);
    }
  });
});
