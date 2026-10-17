// #340：探针与口径登记的一致性守卫。
//
// 这两处都是「登记写一套、实现对不上」的形态（devUrl 退出码写了 3 但实测永远是 2；注释引用的对照源没入库），
// 靠人盯必然复发，故用源级断言把三条口径锁住：
//  ① 探针用到的退出码集合 = 登记处写明的那套；
//  ② **devUrl 检查必须排在自检之前**（否则 devUrl 页面必然撞「对照加载成功」的先手判定，专属退出码 3 不可达）；
//  ③ 探针的对照源必须**内联自起**且真 PNG 存在于仓库（不许再指向未入库的临时脚本）。
// v3.5.0 起：退出码表从 `docs/asset-csp-309.md` 迁入 CONTRIBUTING「依赖升级」（锚定
// 「probe-asset-csp.mjs`（asset 协议 CSP 探针）」引言行之后的表，不与其余表格混淆）。
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const probe = readFileSync(resolve(process.cwd(), "scripts/probe-asset-csp.mjs"), "utf8");
const doc = readFileSync(resolve(process.cwd(), "CONTRIBUTING.md"), "utf8");

/**
 * CONTRIBUTING 里本探针的退出码表：先锚定「probe-asset-csp.mjs`（asset 协议 CSP 探针）」引言行，
 * 再取其后第一张「| 退出码 |」表（按行收集到第一个非表格行为止）。
 * 不能用「从首个 `| 退出码 |` 切到下一个 `##`」——CONTRIBUTING 里还有另一个探针的表，
 * 锚定引言行才能保证取到的是**本探针**的表。
 */
function docExitTable(): string {
  const anchor = doc.indexOf("probe-asset-csp.mjs`（asset 协议 CSP 探针）");
  expect(anchor, "CONTRIBUTING「依赖升级」应有本探针的退出码表引言行").toBeGreaterThan(-1);
  const start = doc.indexOf("| 退出码 |", anchor);
  expect(start, "引言行之后应有「| 退出码 | 含义 |」表").toBeGreaterThan(-1);
  const lines = doc.slice(start).split("\n");
  const rows: string[] = [];
  for (const line of lines) {
    if (!line.trimStart().startsWith("|")) break;
    rows.push(line);
  }
  return rows.join("\n");
}

describe("#340 asset-CSP 探针：与口径登记一致", () => {
  it("探针用到的退出码集合 = CONTRIBUTING 退出码表那一段（锚定引言行，不被无关表格满足）", () => {
    const used = new Set(
      [...probe.matchAll(/finish\((\d)\)|process\.exit\((\d)\)/g)].map((m) => m[1] ?? m[2]),
    );
    expect([...used].sort()).toEqual(["0", "1", "2", "3"]);
    // #342：断言必须限定在**退出码表那一段** —— 否则实测数据表 violations 列里的 `| 2 |` / `| 3 |`
    // 会把「退出码表漏了一行」也满足掉（复核实测：把 `| 3 |` 改成 `| 三 |` 时断言仍然 4 passed ✗）。
    const exitTable = docExitTable();
    for (const code of used) {
      expect(exitTable, `退出码表里应有一行 \`| ${code} |\``).toContain(`| ${code} |`);
    }
    // 顺带钉住语义：3 必须就是 devUrl 那一行（不许张冠李戴）
    expect(exitTable, "退出码 3 必须写明是 devUrl 形态").toMatch(/\|\s*3\s*\|[^|]*devUrl/);
  });

  it("devUrl 判定必须排在自检之前 —— 否则 devUrl 页面永远拿不到专属退出码 3", () => {
    const devUrlAt = probe.indexOf("finish(3)");
    const selfCheckAt = probe.indexOf("out.control.timeout");
    expect(devUrlAt, "探针里应有 devUrl 的 finish(3)").toBeGreaterThan(-1);
    expect(selfCheckAt, "探针里应有自检的超时分支").toBeGreaterThan(-1);
    expect(devUrlAt, "devUrl 的 finish(3) 必须出现在自检之前").toBeLessThan(selfCheckAt);
  });

  it("对照源内联自起，且对照用的 PNG 按**脚本位置**解析（不绑 cwd、不依赖未入库脚本）", () => {
    expect(probe, "不许再指向 tmp/pngserver.mjs 这类未入库的临时脚本").not.toMatch(/tmp\/pngserver/);
    expect(probe, "应自己起对照源").toMatch(/createServer\(/);
    // #342：路径必须相对**脚本自身**（import.meta.url），否则从别的目录跑会抛原始 ENOENT
    expect(probe, "不许再用相对 cwd 的裸路径读对照 PNG").not.toMatch(/readFileSync\("src-tauri\//);
    const png = /new URL\("([^"]+\.png)", import\.meta\.url\)/.exec(probe);
    expect(png, "应按 import.meta.url 解析对照 PNG").toBeTruthy();
    const pngPath = resolve(process.cwd(), "scripts", png?.[1] ?? "");
    expect(existsSync(pngPath), `对照 PNG 必须存在：${pngPath}`).toBe(true);
  });

  it("预检查必须带超时 —— 否则对照源被黑洞吞掉时裸 fetch 会永久挂起（#342 新增防护不许静默回退）", () => {
    // #342 复核实测：删掉 `AbortSignal.timeout(5000)` 后仍是 4 passed ⇒ 新增的挂起防护可被静默回退。
    const preCheck = /fetch\(ctrlUrl,\s*\{[\s\S]{0,160}?signal:\s*AbortSignal\.timeout\(\s*(\d+)\s*\)/.exec(
      probe,
    );
    expect(preCheck, "预检查 fetch 必须带 AbortSignal.timeout(…)").toBeTruthy();
    expect(Number(preCheck?.[1]), "超时毫秒数须与报错文案「预检查超时 5s」一致").toBe(5000);
    expect(probe, "报错文案要写明秒数，别让文案与实现悄悄漂移").toMatch(/预检查超时\s*5s/);
  });

  it("错误信息必须经 firstLine() 取首行（#342：CDP 分支漏取，输出仍是 `Call log:` 多行 + ANSI）", () => {
    expect(probe, "应有统一的 firstLine 出口").toMatch(/const firstLine = \(e\) =>/);
    expect(probe, "不许再直接内联 e.message（会把中文提示挤到多行之后）").not.toMatch(
      /\$\{[^}]*e\.message/,
    );
    expect(probe, "对照源分支应经 firstLine() 取首行").toMatch(
      /对照源不可达[\s\S]{0,160}?\$\{firstLine\(e\)\}/,
    );
    expect(probe, "CDP 分支同样要取 firstLine() —— 口径必须与对照源分支一致").toMatch(
      /连不上 CDP[\s\S]{0,80}?\$\{firstLine\(e\)\}/,
    );
  });

  it("头注释的退出码图例与 CONTRIBUTING 退出码表逐项同步（#342 漏了「读不到对照 PNG」「预检查 5s 超时」）", () => {
    const exitTable = docExitTable();
    /** 把一行文案拆成可比较的小项：去括号/反引号/强调，再按分隔符切开 */
    const items = (s: string) =>
      s
        .replace(/[（）()]/g, "、")
        .replace(/[`*]/g, "")
        .split(/[、/：]/)
        .map((t) => t.trim())
        .filter((t) => t.length > 1);
    for (const code of ["0", "1", "2", "3"]) {
      const docRow = new RegExp(`^\\|\\s*${code}\\s*\\|\\s*(.+?)\\s*\\|\\s*$`, "m").exec(exitTable);
      const legend = new RegExp(`^//\\s*${code}\\s+(.+)$`, "m").exec(probe);
      expect(docRow, `文档退出码表应有 ${code} 那一行`).toBeTruthy();
      expect(legend, `探针头注释应有退出码 ${code} 的图例`).toBeTruthy();
      // 两边都先去掉反引号/强调标记再比，否则文档里的 `asset.ok` 永远对不上图例的 `asset.ok`
      const legendText = (legend?.[1] ?? "").replace(/[`*]/g, "");
      const missing = items(docRow?.[1] ?? "").filter((t) => !legendText.includes(t));
      expect(missing, `退出码 ${code} 的图例漏了：${missing.join(" / ")}`).toEqual([]);
    }
  });

  it("文档不再引用未入库的对照源，并写明「超时不算通过」", () => {
    expect(doc).not.toMatch(/tmp\/pngserver/);
    expect(doc).toContain("scripts/probe-asset-csp.mjs");
    expect(doc, "必须写明对照超时也不得当作「被拦」").toMatch(/超时/);
  });
});
