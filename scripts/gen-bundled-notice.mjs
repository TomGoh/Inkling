#!/usr/bin/env node
/**
 * #308 生成**随包**的第三方许可与署名文本（不联网：输入全部来自仓库内已归档的文件）。
 *
 * 产物：
 *  1. `src-tauri/resources/themes/NOTICE` —— 随 `bundle.resources` 进安装包（与主题同级）：
 *     每款主题给「上游 / 版本·commit / 随包文件（是否改名）/ 版权行 / **许可全文逐字节**」，
 *     满足 MIT「分发的副本中须包含版权声明与许可全文」的条件；
 *  2. `THIRD-PARTY.md` —— 仓库内署名清单（含 sha256 与逐文件「修改说明」）。
 *
 * 用法：`npm run gen:theme-notice`（幂等；改登记或换上游后重跑）
 * 校验：`npm run check:theme-licenses` 核对 NOTICE / 署名清单与登记、归档许可是否一致。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = join(ROOT, "docs", "theme-licenses.json");
const SHIP_DIR = join(ROOT, "src-tauri", "resources", "themes");
const NOTICE = join(SHIP_DIR, "NOTICE");
const THIRD_PARTY = join(ROOT, "THIRD-PARTY.md");

/** 未随包资源的逐款说明（数据来自选题研究：上游引用但未随包的字体文件） */
const FONT_NOTES = {
  drake: "上游 `drake/font.css`（字体声明文件，其内 `@font-face` 引用的字体文件亦未随包）",
  lapis:
    "上游 4 个字体文件（`Cantarell-VF-fixed.otf` 0.1 MB、`JetBrainsMono-Regular.ttf` 0.3 MB、`SourceHanSerifCN-Medium.ttf` 13.4 MB、`SourceHanSerifCN-Bold.ttf` 13.5 MB，合计 28.5 MB）",
};

const registry = JSON.parse(readFileSync(REGISTRY, "utf8"));
const byAttribution = new Map();
for (const t of registry.themes) {
  const key = t.attribution.replace("THIRD-PARTY.md#", "");
  if (!byAttribution.has(key)) byAttribution.set(key, []);
  byAttribution.get(key).push(t);
}

const notice = [
  "# 第三方主题许可与署名（随安装包分发）",
  "",
  "本文件随安装包分发（`$RESOURCE/themes/NOTICE`），列出随包第三方主题的版权声明与许可全文。",
  "仓库内另有发版登记 `docs/theme-licenses.json`（含逐文件 sha256）与署名清单 `THIRD-PARTY.md`。",
  "",
];
const thirdParty = [
  "# 第三方组件与主题署名（THIRD-PARTY）",
  "",
  "> 本文件是**第三方作品**的署名与许可清单，与项目贡献者名单分列、不合并。",
  "> 生成：`npm run gen:theme-notice`；校验：`npm run check:theme-licenses`。",
  "> 登记对象是**安装包内的只读源副本** `src-tauri/resources/themes/`（不查用户机器上的运行时副本）。",
  "> 安装包内随附的许可文本：`$RESOURCE/themes/NOTICE`。",
  "",
  "## 预装主题（Typora 生态）",
  "",
];

for (const [section, themes] of byAttribution) {
  const head = themes[0];
  const text = readFileSync(join(ROOT, head.licenseFile), "utf8");
  const copyright = (text.split(/\r?\n/).find((l) => /copyright/i.test(l)) ?? "").trim();
  const ids = themes.map((t) => `\`${t.id}\``).join("、");
  const shippedNames = themes.map((t) => t.shippedCss.split("/").pop());
  const describe = (t) => {
    const name = t.shippedCss.split("/").pop();
    const renamed = name !== t.upstreamPath;
    return `${name}（上游 \`${t.upstreamPath}\`，${
      renamed ? "**仅重命名，内容逐字节未改**" : "**上游同名，内容未改动**"
    }，${t.bytes} 字节，sha256 \`${t.sha256.slice(0, 16)}…\`）`;
  };

  notice.push(`## ${ids}`, "");
  notice.push(`- 上游：${head.upstream}（版本 \`${head.version}\`，commit \`${head.commit}\`）`);
  notice.push(`- ${copyright}`);
  notice.push(`- 随包文件：${shippedNames.join("、")}`);
  if (FONT_NOTES[section]) notice.push(`- 未随包资源：${FONT_NOTES[section]}`);
  notice.push("");
  notice.push("```text");
  notice.push(text.trimEnd());
  notice.push("```");
  notice.push("");

  thirdParty.push(`### ${section}`, "");
  thirdParty.push(`- 预装主题 id：${ids}（明暗成对，同一上游作品）`);
  thirdParty.push(`- 上游：${head.upstream}（版本 \`${head.version}\`，commit \`${head.commit}\`）`);
  thirdParty.push(
    `- 许可：**${head.license}**，归档全文见 \`${head.licenseFile}\`；**安装包内副本见 \`$RESOURCE/themes/NOTICE\`**`,
  );
  thirdParty.push(`- ${copyright}`);
  for (const t of themes) thirdParty.push(`- 随包文件：${describe(t)}`);
  if (FONT_NOTES[section]) {
    thirdParty.push(
      `- **未随包资源**：${FONT_NOTES[section]}——本应用字体策略为**默认降级系统字体、不内嵌**（尤其中文大字体），故不随包分发；相应 \`@font-face\` 失效后由系统字体接管。`,
    );
  }
  thirdParty.push("");
}

thirdParty.push("## 运行时依赖");
thirdParty.push("");
thirdParty.push(
  "- KaTeX / Mermaid / CodeMirror 等运行时依赖按其自身许可（MIT 等）分发；按同一条「副本须附版权与许可」的条件，**其声明也应随包提供**。",
);
thirdParty.push(
  "  当前只在仓库内登记（`package.json` 与各自仓库），**尚未随包产出** → 已登记为后续项（见 `docs/theme-packaging-308.md` §7）。",
);
thirdParty.push("");

writeFileSync(NOTICE, `${notice.join("\n").trimEnd()}\n`, "utf8");
writeFileSync(THIRD_PARTY, `${thirdParty.join("\n").trimEnd()}\n`, "utf8");
console.log(
  `已生成 ${NOTICE.replace(`${ROOT}/`, "")}（${readFileSync(NOTICE, "utf8").length} 字节）与 THIRD-PARTY.md（${readFileSync(THIRD_PARTY, "utf8").length} 字节）`,
);
