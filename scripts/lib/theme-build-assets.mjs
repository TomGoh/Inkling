/**
 * S16 产物清单对账的**纯逻辑**（#312 项 3）：脚本与单测共用同一实现。
 *
 * 背景：`tests/fixtures/theme-entries.json` 里登记了 `buildAssets`（cssCount / requiredChunks），
 * 但此前脚本把 `3` 与 chunk 名**硬编码** ⇒ 清单与实现两处会各自漂移，与 #310 声明的
 * 「清单是唯一真值源」冲突。这里把判据抽出来，脚本只做 IO + 报告，单测直接打负例。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** 读取主题样式清单（唯一真值源） */
export function readThemeEntries(root = process.cwd()) {
  return JSON.parse(readFileSync(resolve(root, "tests/fixtures/theme-entries.json"), "utf8"));
}

/**
 * 产物对账：返回违规列表（空数组 = 通过）。数量与必需 chunk **都来自清单**。
 * @param {string[]} cssFiles dist/assets 下的 css 文件名
 * @param {{cssCount: number, requiredChunks: string[]}} manifest
 */
export function reconcileBuildAssets(cssFiles, manifest) {
  const out = [];
  const { cssCount, requiredChunks } = manifest;
  if (cssFiles.length !== cssCount) {
    out.push(
      `CSS 资产数应为 ${cssCount}（${requiredChunks.join(" / ")}），实际 ${cssFiles.length}：${cssFiles.join(", ")}`,
    );
  }
  for (const chunk of requiredChunks) {
    if (!cssFiles.some((f) => f.startsWith(`${chunk}-`) && f.endsWith(".css"))) {
      out.push(`缺少 ${chunk} CSS 资产`);
    }
  }
  return out;
}

/**
 * 压缩形态判据（#312 项 3）：esbuild 压缩后的 CSS 应为**单行**（允许一个尾换行）。
 *
 * 旧判据「换行数 > 2 即失败」两头都不严：少量换行（恰好 1–2 个）能绕过，
 * 而合法产物若带 sourcemap 注释之类的换行又会误报。新口径与「压缩 = 单行」直接对应。
 */
export function isMinifiedSingleLine(css) {
  return css.trimEnd().split("\n").length === 1;
}
