// #350 / #351：`scripts/probe-asset-bg-export.mjs` 的源级口径守卫。
//
// 背景：该探针的判定（exit 0）与结论本身已复核属实，缺的是「探针实现 ↔ 文档口径」的锁定——
// 退出码 0–4 此前只写在脚本头注释里，文档只记了「判定通过（exit 0）」；于是改退出码、
// 删掉某条自检、去掉诊断 fetch 的超时，全都没人拦。照 `tests/unit/asset-csp-probe.test.ts`
// （#340 建立、#342 加固）的形态，本文件锁住四件事：
//  ① 探针用到的退出码集合 = 文档退出码表 = 头注释图例（含 2 / 3 / 4）；
//  ② devUrl 判定（finish(3)）必须排在自检之前，否则专属退出码 3 不可达；
//  ③ 三条对照自检（对照 A 必须画上 / 对照 B 必须没画上 / 探针图中心 ≠ 标记色）不可被静默回退；
//  ④ 诊断 fetch 必须带 5s 超时，且「超时」与「被 CSP 拦」分开归因（#342 的同型教训）。
// 另按 #351 锁住「结论绑定 tauri 版本」的触发点：升级后没重跑探针就会红在版本对账上。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const probe = read("scripts/probe-asset-bg-export.mjs");
const doc = read("docs/theme-builtin-226.md");
const contributing = read("CONTRIBUTING.md");

/** 剥掉 Markdown 的强调/行内代码标记，让「头注释图例」与「文档表格」逐字可比 */
const plain = (s: string) => s.replace(/[`*]/g, "");

/** 文档里的退出码表：必须限定在「| 退出码 |」那一段内（#342 的教训：别被无关表格满足） */
function docExitTable(): string {
  const start = doc.indexOf("| 退出码 |");
  expect(start, "文档应有「| 退出码 | 含义 |」表").toBeGreaterThan(-1);
  const nextHeading = doc.indexOf("\n## ", start);
  return doc.slice(start, nextHeading < 0 ? undefined : nextHeading);
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

/** 每个退出码必须同时出现在文档表与头注释图例里的语义关键词（防张冠李戴） */
const SEMANTICS: Record<string, RegExp[]> = {
  "0": [/判定通过/, /对照成立/],
  "1": [/用法\/环境错/],
  "2": [/自检失败/, /结论无效/],
  "3": [/devUrl/, /CSP/],
  "4": [/判定失败/, /静默丢图/],
};

describe("#350 asset 背景图探针：源级口径守卫", () => {
  it("探针用到的退出码集合 = 0–4，且文档退出码表与头注释图例逐码对齐", () => {
    const used = new Set(
      [...probe.matchAll(/finish\((\d)\)|process\.exit\((\d)\)/g)].map((m) => m[1] ?? m[2]),
    );
    expect([...used].sort(), "退出码集合被改过就要重写文档表与头注释").toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
    ]);

    expect(docExitTable(), "退出码表必须写明 0–4 全部五种").toBeTruthy();
    for (const code of [...used].sort()) {
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

  it("devUrl 判定必须排在自检之前 —— 否则 devUrl 页面拿不到专属退出码 3（#340 同型）", () => {
    const devUrlAt = probe.indexOf("await finish(3)");
    const firstSelfCheckAt = probe.indexOf("if (out.imageCenterIsFallback)");
    expect(devUrlAt, "探针里应有 devUrl 的 finish(3)").toBeGreaterThan(-1);
    expect(firstSelfCheckAt, "探针里应有第一条自检").toBeGreaterThan(-1);
    expect(devUrlAt, "devUrl 的 finish(3) 必须出现在自检之前").toBeLessThan(firstSelfCheckAt);
  });

  it("三条对照自检不可被静默回退（回退后结论会被误当有效）", () => {
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
    // 三条自检各自命中自己的 finish(2)
    expect(probe, "对照 A 没画上必须判无效（exit 2）").toMatch(
      /if \(!out\.controlData\.painted\) \{[\s\S]{0,600}?await finish\(2\)/,
    );
    expect(probe, "对照 B 被画上必须判无效（exit 2）").toMatch(
      /if \(out\.controlNoImage\.painted\) \{[\s\S]{0,600}?await finish\(2\)/,
    );
    expect(probe, "探针图中心≈标记色必须判无效（exit 2）").toMatch(
      /if \(out\.imageCenterIsFallback\) \{[\s\S]{0,600}?await finish\(2\)/,
    );
  });

  it("诊断 fetch 必须带 5s 超时，且「超时」与「被 CSP 拦」分开归因（#342 同型防护）", () => {
    // #350 复核实测：删掉超时后本文件其余断言仍全绿 ⇒ 必须单独锁住这一行。
    const m =
      /fetch\(assetUrl,\s*\{[\s\S]{0,160}?signal:\s*AbortSignal\.timeout\(\s*(\d+)\s*\)/.exec(probe);
    expect(m, "诊断 fetch 必须带 AbortSignal.timeout(…)").toBeTruthy();
    expect(Number(m?.[1]), "超时毫秒数须与文案「诊断 fetch 超时 5s」一致").toBe(5000);
    expect(probe, "报错文案要写明秒数，别让文案与实现悄悄漂移").toMatch(/诊断 fetch 超时\s*5s/);
    // 超时必须独立标记，且不许被 cspBlocked 覆盖（否则「没响应」会被读成「被 CSP 拦」）
    expect(probe, "超时分支必须带 timeout 标记").toMatch(/timeout:\s*true/);
    expect(probe, "cspBlocked 归因必须排除超时分支").toMatch(
      /!corsFetch\.ok &&\s*!corsFetch\.timeout/,
    );
    // 另一条跨源信号（<img crossOrigin>）的兜底不许悄悄消失
    expect(probe, "<img crossOrigin> 的 8s 兜底必须保留").toMatch(
      /setTimeout\(\(\) => resolve\(\{ ok: false, timeout: true \}\), 8000\)/,
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
  it("文档必须引用探针路径，升级清单必须写「重跑探针并确认 exit 0」", () => {
    expect(doc, "文档必须出现探针脚本路径").toContain("scripts/probe-asset-bg-export.mjs");
    expect(plain(contributing), "CONTRIBUTING 的依赖升级清单必须点名该探针").toContain(
      "scripts/probe-asset-bg-export.mjs",
    );
    expect(
      plain(contributing),
      "升级 tauri 后必须重跑探针并确认 exit 0 —— 只写「注意兼容性」不构成触发点",
    ).toMatch(/升级 tauri[\s\S]{0,400}?exit 0/);
  });

  it("结论绑定的 tauri 版本必须与 Cargo.lock 一致（升级后忘了重跑探针就红在这里）", () => {
    const lock = read("src-tauri/Cargo.lock");
    const locked = /\[\[package\]\]\r?\nname = "tauri"\r?\nversion = "([^"]+)"/.exec(lock)?.[1];
    expect(locked, "Cargo.lock 里应有 tauri 包").toBeTruthy();
    expect(
      plain(doc),
      `文档登记的 tauri 版本与 Cargo.lock（${locked}）不一致：升级 tauri 后请先重跑 ` +
        "`node scripts/probe-asset-bg-export.mjs <探针图>` 确认 exit 0，再更新文档与本次断言",
    ).toContain(`tauri ${locked}`);
  });
});
