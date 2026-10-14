// #340：探针与文档的口径一致性守卫。
//
// 这两处都是「文档写一套、实现对不上」的形态（devUrl 退出码写了 3 但实测永远是 2；注释引用的对照源没入库），
// 靠人盯必然复发，故用源级断言把三条口径锁住：
//  ① 探针用到的退出码集合 = 文档写明的那套；
//  ② **devUrl 检查必须排在自检之前**（否则 devUrl 页面必然撞「对照加载成功」的先手判定，专属退出码 3 不可达）；
//  ③ 探针的对照源必须**内联自起**且真 PNG 存在于仓库（不许再指向未入库的临时脚本）。
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const probe = readFileSync(resolve(process.cwd(), "scripts/probe-asset-csp.mjs"), "utf8");
const doc = readFileSync(resolve(process.cwd(), "docs/asset-csp-309.md"), "utf8");

describe("#340 asset-CSP 探针：与文档口径一致", () => {
  it("探针用到的退出码集合 = 文档退出码表那一段（限定范围，不被无关表格满足）", () => {
    const used = new Set(
      [...probe.matchAll(/finish\((\d)\)|process\.exit\((\d)\)/g)].map((m) => m[1] ?? m[2]),
    );
    expect([...used].sort()).toEqual(["0", "1", "2", "3"]);
    // #342：断言必须限定在**退出码表那一段** —— 否则实测数据表 violations 列里的 `| 2 |` / `| 3 |`
    // 会把「退出码表漏了一行」也满足掉（复核实测：把 `| 3 |` 改成 `| 三 |` 时断言仍然 4 passed ✗）。
    const start = doc.indexOf("| 退出码 |");
    expect(start, "文档应有「| 退出码 | 含义 |」表").toBeGreaterThan(-1);
    const nextHeading = doc.indexOf("\n## ", start);
    const exitTable = doc.slice(start, nextHeading < 0 ? undefined : nextHeading);
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

  it("文档不再引用未入库的对照源，并写明「超时不算通过」", () => {
    expect(doc).not.toMatch(/tmp\/pngserver/);
    expect(doc).toContain("scripts/probe-asset-csp.mjs");
    expect(doc, "必须写明对照超时也不得当作「被拦」").toMatch(/超时/);
  });
});
