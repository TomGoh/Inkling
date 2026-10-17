// #350 / #351：`scripts/probe-asset-bg-export.mjs` 的源级口径守卫。
//
// 背景：该探针的判定（exit 0）与结论本身已复核属实，缺的是「探针实现 ↔ 口径登记」的锁定——
// 退出码此前只写在脚本头注释里，登记处只记了「判定通过（exit 0）」；于是改退出码、删掉某条自检、
// 去掉长度防护，全都没人拦。照 `tests/unit/asset-csp-probe.test.ts`（#340 建立、#342 加固）的形态锁：
//  ① 探针用到的退出码集合 = CONTRIBUTING「依赖升级」的退出码表 = 头注释图例（0–5，含 2 / 3 / 4 / 5）；
//  ② 判定顺序固定：devUrl（3）→ 渲染超时（5）→ 自检（2）→ 目标（0/4）；
//  ③ 三条对照自检**在各自块内**恰好一个 `await finish(2)`（块级锚定，不用字符数窗口）；
//  ④ 两处长度防护都必须带超时、且归因互不串味：
//     · 诊断 `fetch` 5s（`corsFetch.timeout` 与 `cspBlocked` 互斥）；
//     · `runCase()` 的 html2canvas 20s（独立哨兵，不落进 `cspBlocked` / exit 4）。
// 另按 #351 锁住「结论绑定 tauri 版本」的触发点。
// v3.5.0 起：退出码表从 `docs/theme-builtin-226.md` §4 迁入 CONTRIBUTING「依赖升级」（锚定
// 「probe-asset-bg-export.mjs`（asset 背景图导出探针）」引言行之后的表，不与其余表格混淆）。
//
// 断言强度用突变实测过（#350 复核阻塞项 1/2）：删块内 `finish(2)`、把 `finish(2)` 改成 `finish(0)`、
// 只删 `corsFetch` 超时分支的 `timeout: true`（保留 `<img>` 的 8s 兜底）、删渲染超时、把渲染超时
// 并进丢图归因 —— 五种改动都必须让本文件变红。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const probe = read("scripts/probe-asset-bg-export.mjs");
const contributing = read("CONTRIBUTING.md");

/** 剥掉 Markdown 的强调/行内代码标记，让「头注释图例」与「文档表格」逐字可比 */
const plain = (s: string) => s.replace(/[`*]/g, "");

/**
 * 取 `if (<cond>) {` 到该块收尾 `}` 的完整块：按大括号配对切片。
 * 不能用 `[\s\S]{0,600}` 这类字符数窗口 —— 实测 245 字符就能跨到下一个自检块，
 * 「删掉本块的 finish(2)」会由**下一块**的 finish(2) 满足掉（#350 复核阻塞项 1）。
 */
function braceBlock(source: string, header: string): string {
  const start = source.indexOf(header);
  if (start < 0) return "";
  const open = source.indexOf("{", start);
  if (open < 0) return "";
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return "";
}

/**
 * CONTRIBUTING 里本探针的退出码表：先锚定「probe-asset-bg-export.mjs`（asset 背景图导出探针）」
 * 引言行，再取其后第一张「| 退出码 |」表（按行收集到第一个非表格行为止）。
 * 不能用「从首个 `| 退出码 |` 切到下一个 `##`」——CONTRIBUTING 里还有另一个探针的表（#342 的教训：
 * 别让无关表格满足断言），锚定引言行才能保证取到的是**本探针**的表。
 */
function docExitTable(): string {
  const anchor = contributing.indexOf("probe-asset-bg-export.mjs`（asset 背景图导出探针）");
  expect(anchor, "CONTRIBUTING「依赖升级」应有本探针的退出码表引言行").toBeGreaterThan(-1);
  const start = contributing.indexOf("| 退出码 |", anchor);
  expect(start, "引言行之后应有「| 退出码 | 含义 |」表").toBeGreaterThan(-1);
  const lines = contributing.slice(start).split("\n");
  const rows: string[] = [];
  for (const line of lines) {
    if (!line.trimStart().startsWith("|")) break;
    rows.push(line);
  }
  return rows.join("\n");
}

/** 取文档退出码表里 `code` 那一行的含义列（去标记） */
function docExitRow(code: string): string {
  const row = new RegExp(`^\\|\\s*${code}\\s*\\|\\s*(.+?)\\s*\\|\\s*$`, "m").exec(docExitTable());
  return row ? plain(row[1]) : "";
}

/** 取脚本头注释里 `code` 的图例（含缩进更深的续行 `//     · …`，到下一个退出码为止） */
function headLegend(code: string): string {
  const lines = probe.split("\n");
  const start = lines.findIndex((l) => new RegExp(`^//\\s+${code}\\s`).test(l));
  if (start < 0) return "";
  const block = [lines[start]];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\/\//.test(line)) break;
    if (/^\/\/\s+\d\s/.test(line)) break;
    if (!/^\/\/\s{3,}\S/.test(line)) break;
    block.push(line);
  }
  return plain(block.join("\n"));
}

/** 探针实际用到的退出码（`finish(n)` / `process.exit(n)`），升序 */
function usedExitCodes(): string[] {
  const used = new Set(
    [...probe.matchAll(/finish\((\d)\)|process\.exit\((\d)\)/g)].map((m) => m[1] ?? m[2]),
  );
  return [...used].sort();
}

/** 每个退出码必须同时出现在文档表与头注释图例里的语义关键词（防张冠李戴） */
const SEMANTICS: Record<string, RegExp[]> = {
  "0": [/判定通过/, /对照成立/],
  "1": [/用法\/环境错/],
  "2": [/自检失败/, /结论无效/],
  "3": [/devUrl/, /CSP/],
  "4": [/判定失败/, /静默丢图/],
  "5": [/渲染超时/, /无法判定/, /20s/],
};

describe("#350 asset 背景图探针：源级口径守卫", () => {
  it("探针用到的退出码集合 = 0–5，且文档退出码表与头注释图例逐码对齐", () => {
    const used = usedExitCodes();
    expect(used, "退出码集合被改过就要重写文档表与头注释").toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);

    expect(docExitTable(), "退出码表必须写明 0–5 全部六种").toBeTruthy();
    for (const code of used) {
      const row = docExitRow(code);
      expect(row, `文档退出码表应有一行 \`| ${code} |\``).not.toBe("");
      const legend = headLegend(code);
      expect(legend, `探针头注释应有退出码 ${code} 的图例`).not.toBe("");
      for (const re of SEMANTICS[code]) {
        expect(row, `文档退出码 ${code} 的含义应匹配 ${re}`).toMatch(re);
        expect(legend, `头注释退出码 ${code} 的图例应匹配 ${re}`).toMatch(re);
      }
    }
  });

  it("判定顺序：devUrl（3）→ 渲染超时（5）→ 自检（2）→ 丢图（4）", () => {
    const devUrlAt = probe.indexOf("await finish(3)");
    const timeoutAt = probe.indexOf("await finish(5)");
    const selfCheckAt = probe.indexOf("if (out.imageCenterIsFallback)");
    const verdictFailAt = probe.indexOf("✗ 判定失败");
    expect(devUrlAt, "探针里应有 devUrl 的 finish(3)").toBeGreaterThan(-1);
    expect(timeoutAt, "探针里应有渲染超时的 finish(5)").toBeGreaterThan(-1);
    expect(selfCheckAt, "探针里应有第一条自检").toBeGreaterThan(-1);
    expect(verdictFailAt, "探针里应有丢图归因文案").toBeGreaterThan(-1);
    // devUrl 最前：devUrl 页面必然没有 CSP，自检放在前面会让专属退出码 3 不可达（#340 同型）
    expect(devUrlAt, "devUrl 判定必须最早").toBeLessThan(timeoutAt);
    // 超时次之：一条用例没返回时「有没有画上」不成立，落进自检/丢图就是误报
    expect(timeoutAt, "渲染超时判定必须早于自检").toBeLessThan(selfCheckAt);
    expect(selfCheckAt, "自检必须早于丢图判定").toBeLessThan(verdictFailAt);
  });

  it("三条对照自检必须在**自己的块内**恰好一个 await finish(2)（块级锚定）", () => {
    // 对照 B 的「不存在文件」必须仍由 convertFileSrc 产出（同 scope、与生产同一个 URL 生产者）
    expect(probe, "对照 B 的 URL 必须由 convertFileSrc 产出").toMatch(
      /convert\(`\$\{p\}\.probe-missing`\)/,
    );
    expect(probe, "对照 B 必须真的跑进 runCase").toMatch(
      /runCase\(missingUrl,\s*"controlNoImage"\)/,
    );
    // 采样判据：painted 必须与**期望中心像素**比，不能退化成「非标记色即算画上」
    expect(probe, "painted 判据必须按期望中心像素比").toMatch(
      /const painted = \(r\) => [^;]*dist\(r\.sampled,\s*expected\.rgba\) <= TOL/,
    );

    const selfChecks: Array<[string, string]> = [
      ["对照 A 没画上", "if (!out.controlData.painted) {"],
      ["对照 B 被画上", "if (out.controlNoImage.painted) {"],
      ["探针图中心≈标记色", "if (out.imageCenterIsFallback) {"],
    ];
    for (const [label, header] of selfChecks) {
      const block = braceBlock(probe, header);
      expect(block, `${label} 自检块必须存在：${header}`).not.toBe("");
      const exits = [...block.matchAll(/await finish\((\d+)\)/g)].map((m) => m[1]);
      // 恰好一个、且必须是 2：删掉或改成 finish(0)（自检失败却按「判定通过」退出）都要红
      expect(exits, `${label} 自检块内必须恰好一个 await finish(2)`).toEqual(["2"]);
    }
  });

  it("诊断 fetch 必须带 5s 超时，timeout 标记必须在 corsFetch 的超时分支里", () => {
    // 缺超时：「asset 协议无响应」会把整轮探针挂死（#342 的同型教训）
    const m =
      /fetch\(assetUrl,\s*\{[\s\S]{0,160}?signal:\s*AbortSignal\.timeout\(\s*(\d+)\s*\)/.exec(probe);
    expect(m, "诊断 fetch 必须带 AbortSignal.timeout(…)").toBeTruthy();
    expect(Number(m?.[1]), "超时毫秒数须与文案「诊断 fetch 超时 5s」一致").toBe(5000);
    expect(probe, "报错文案要写明秒数，别让文案与实现悄悄漂移").toMatch(/诊断 fetch 超时\s*5s/);

    // 锚定到 `corsFetch = timedOut ? … : …` 这一整段再断言：
    // 否则 `<img crossOrigin>` 的 8s 兜底也含 `timeout: true`，会替这里「背书」（复核阻塞项 2）
    const branchStart = probe.indexOf("corsFetch = timedOut");
    const branchEnd = probe.indexOf(": { ok: false, error: msg };", branchStart);
    const timeoutBranch =
      branchStart >= 0 && branchEnd > branchStart ? probe.slice(branchStart, branchEnd) : "";
    expect(timeoutBranch, "应存在 corsFetch 的超时分支（timedOut 三元的真分支）").not.toBe("");
    expect(
      timeoutBranch,
      "超时分支必须带 timeout: true —— 否则 `!corsFetch.timeout` 恒真，超时会被 cspBlocked 覆盖",
    ).toMatch(/timeout:\s*true/);
    expect(probe, "cspBlocked 归因必须排除超时分支").toMatch(
      /!corsFetch\.ok &&\s*!corsFetch\.timeout/,
    );
    // 另一条跨源信号（<img crossOrigin>）的兜底不许悄悄消失
    expect(probe, "<img crossOrigin> 的 8s 兜底必须保留").toMatch(
      /setTimeout\(\(\) => resolve\(\{ ok: false, timeout: true \}\), 8000\)/,
    );
  });

  it("runCase 的 html2canvas 必须带 20s 超时，且归因独立（不落进 cspBlocked / exit 4）", () => {
    // 机制：必须与超时哨兵竞速，而不是裸 await（html2canvas 1.4.1 的 CacheStorage.loadImage 无超时）
    expect(probe, "html2canvas 调用必须与超时哨兵竞速").toMatch(
      /Promise\.race\(\[\s*window\.html2canvas\(themeRoot,\s*\{[\s\S]{0,300}?\}\),\s*new Promise\(\(_, reject\) => \{[\s\S]{0,200}?setTimeout\(\(\) => reject\(renderTimeout\(\)\), renderTimeoutMs\)/,
    );
    const timeoutMs = Number(/const RENDER_TIMEOUT_MS = (\d+);/.exec(probe)?.[1]);
    expect(timeoutMs, "渲染超时常量必须是显式毫秒数").toBe(20000);
    // 秒数文案由常量推导 ⇒ 改常量不会与「20s」文案漂移（文档表那行由 SEMANTICS 的 /20s/ 兜住）
    expect(probe, "文案秒数必须由 RENDER_TIMEOUT_MS 推导").toMatch(
      /html2canvas 渲染超时 \$\{RENDER_TIMEOUT_MS \/ 1000\}s/,
    );
    expect(probe, "超时必须由独立哨兵标记（否则与「真的丢图」无法区分）").toMatch(
      /res\.timedOut = e instanceof Error && e\.name === renderTimeoutName/,
    );

    // ── 接线守卫（#350 三轮复核）：常量算对了不等于「真的传进页面 / 两端真的同名」──
    // ① 哨兵名单一来源：写端（err.name）与读端（e.name ===）都用同一个常量，
    //    全文件只许出现一次字面量 "ProbeRenderTimeout"（即常量定义本身）。
    expect(probe, "哨兵名必须是单一常量").toMatch(
      /const RENDER_TIMEOUT_NAME = "ProbeRenderTimeout";/,
    );
    expect(probe, "哨兵写端必须用同一常量").toMatch(/err\.name = renderTimeoutName;/);
    expect(probe, "哨兵读端必须用同一常量").toMatch(/e\.name === renderTimeoutName/);
    expect(
      (probe.match(/ProbeRenderTimeout/g) ?? []).length,
      "字面量只许出现在常量定义里 —— 两端各写一个字面量时「改一半」不会被发现",
    ).toBe(1);

    // ② 参数接线：常量必须真的作为 page.evaluate 的第三参传进去。
    //    删掉 renderTimeoutMs ⇒ setTimeout(…, undefined) = 0ms ⇒ 四个用例全 timedOut，每次都 exit 5；
    //    删掉 renderTimeoutText ⇒ res.error 丢失文案，exit 5 的归因失真。
    const evaluateArgs = /\{\s*absPath,\s*dataUrl[\s\S]{0,300}?\}/.exec(probe)?.[0] ?? "";
    expect(evaluateArgs, "应能定位 page.evaluate 的参数对象").not.toBe("");
    for (const [prop, constant] of [
      ["renderTimeoutMs", "RENDER_TIMEOUT_MS"],
      ["renderTimeoutText", "RENDER_TIMEOUT_TEXT"],
      ["renderTimeoutName", "RENDER_TIMEOUT_NAME"],
    ]) {
      expect(evaluateArgs, `参数对象必须传 ${prop}: ${constant}`).toMatch(
        new RegExp(`${prop}:\\s*${constant}`),
      );
    }
    // 页面侧的形参解构同样不许丢（缺了就是 undefined）
    const destructure = /async \(\{ absPath: p[\s\S]{0,200}?\}\) =>/.exec(probe)?.[0] ?? "";
    expect(destructure, "应能定位页面侧的形参解构").not.toBe("");
    for (const name of ["renderTimeoutMs", "renderTimeoutText", "renderTimeoutName"]) {
      expect(destructure, `页面侧解构必须包含 ${name}`).toContain(name);
    }

    // ③ 初始状态：res.timedOut 只能由 catch 里的哨兵置位，不许预置 true（否则每次 exit 5）
    const resLine = probe.split("\n").find((l) => l.includes("const res = {")) ?? "";
    expect(resLine, "应能定位 runCase 的 res 初始化").toMatch(/timedOut:\s*false/);
    expect(probe, "不许在别处把 timedOut 预置为 true").not.toMatch(/timedOut:\s*true/);


    const timeoutBlock = braceBlock(probe, "if (stuck.length > 0) {");
    expect(timeoutBlock, "必须有渲染超时专属分支").not.toBe("");
    expect(timeoutBlock, "渲染超时必须是独立退出码 5").toMatch(/await finish\(5\)/);
    expect(timeoutBlock, "渲染超时不得混入 CSP 归因").not.toMatch(/cspBlocked/);
    expect(timeoutBlock, "渲染超时不得复用 exit 4 的丢图文案").not.toMatch(/静默丢图复现/);
  });

  it("渲染超时的聚合 stuck 必须覆盖全部四个用例（缩短它 ⇒ exit 0 假通过 / exit 4 假丢图）", () => {
    // 语义：只聚合**超时**的用例（改成别的字段会让「画上了」也进超时分支）
    expect(probe, "stuck 必须按 timedOut 过滤").toMatch(
      /const stuck = \[[\s\S]{0,200}?\]\.filter\(\s*\(r\) => r\.timedOut/,
    );
    // 覆盖：缩成 `[out.targetAsset]` 时 controlNoImage 超时会被漏掉（对照 B 的 painted=false
    // 不触发自检 B ⇒ 两个 target 画上就 exit 0 假通过）；漏掉 targetStyleSheet 则落进 exit 4
    // 的「静默丢图」（把挂死误报成丢图）。这两种都是本 PR 新增 exit 5 行为的误报通道。
    const m = /const stuck = \[([\s\S]{0,200}?)\]\.filter\(/.exec(probe);
    expect(m, "应有 `const stuck = [...].filter(...)` 聚合").toBeTruthy();
    const items = (m?.[1] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(items.slice().sort(), "stuck 必须逐个引用四个用例结果，少一个就是误报通道").toEqual(
      ["out.controlData", "out.controlNoImage", "out.targetAsset", "out.targetStyleSheet"].sort(),
    );
  });

  it("探针必须复刻生产导出参数（useCORS:true / 不开 allowTaint / scale 2）", () => {
    const call = /window\.html2canvas\(themeRoot,\s*\{[\s\S]{0,240}?\}\)/.exec(probe);
    expect(call, "探针应以 exporter.ts 同参数调用 html2canvas").toBeTruthy();
    const opts = call?.[0] ?? "";
    expect(opts, "useCORS:true 是本次判定的前提").toMatch(/useCORS:\s*true/);
    expect(opts, "allowTaint 会污染 canvas，让 toBlob 抛 SecurityError").not.toMatch(/allowTaint/);
    expect(opts, "scale 必须与 exporter.ts 一致").toMatch(/scale:\s*SCALE/);
  });
});

describe("#351 「结论绑定 tauri 版本」必须有明确触发点", () => {
  it("CONTRIBUTING 必须引用探针路径，升级清单必须写「重跑探针并确认 exit 0」", () => {
    expect(contributing, "CONTRIBUTING 必须出现探针脚本路径").toContain(
      "scripts/probe-asset-bg-export.mjs",
    );
    expect(plain(contributing), "CONTRIBUTING 的依赖升级清单必须点名该探针").toContain(
      "scripts/probe-asset-bg-export.mjs",
    );
    expect(
      plain(contributing),
      "升级 tauri 后必须重跑探针并确认 exit 0 —— 只写「注意兼容性」不构成触发点",
    ).toMatch(/升级 tauri[\s\S]{0,400}?exit 0/);
  });

  it("CONTRIBUTING 的升级清单必须写全退出码口径（新增退出码不许只改登记表与头注释）", () => {
    // 口径三处一致才叫「一致」：头注释图例 / CONTRIBUTING 退出码表 / 升级清单里那句「只有 0 算通过」
    const line = contributing.split("\n").find((l) => l.includes("算通过")) ?? "";
    expect(line, "CONTRIBUTING 升级清单里应有「只有 `0` 算通过」那句").not.toBe("");
    for (const code of usedExitCodes().filter((code) => code !== "0")) {
      expect(line, `CONTRIBUTING 漏了退出码 ${code} 的口径（登记表/头注释改了这里就得同步）`).toContain(
        `\`${code}\``,
      );
    }
  });

  it("结论绑定的 tauri 版本必须与 Cargo.lock 一致（升级后忘了重跑探针就红在这里）", () => {
    const lock = read("src-tauri/Cargo.lock");
    const locked = /\[\[package\]\]\r?\nname = "tauri"\r?\nversion = "([^"]+)"/.exec(lock)?.[1];
    expect(locked, "Cargo.lock 里应有 tauri 包").toBeTruthy();
    expect(
      plain(contributing),
      `CONTRIBUTING 登记的 tauri 版本与 Cargo.lock（${locked}）不一致：升级 tauri 后请先重跑 ` +
        "`node scripts/probe-asset-bg-export.mjs <探针图>` 确认 exit 0，再更新登记与本次断言",
    ).toContain(`tauri ${locked}`);
  });
});
