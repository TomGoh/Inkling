/**
 * #224 主题样式断言共享工具：
 * - 入口清单（tests/fixtures/theme-entries.json）是唯一真值源；
 * - 极简 glob（仅支持 ** 与 *，匹配仓库内 CSS 入口）；
 * - 注释按「空格掩码」处理（保留行号，不改变声明结构）；
 * - 花括号配平切块（#223 A-1：不再依赖「顶格 }」正则，@layer 包裹/缩进后仍正确）。
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, relative, sep } from "node:path";

export interface ThemeEntries {
  tokenDefinitionFiles: string[];
  themeBlocks: { file: string; light: string; dark: string };
  hardcodeScanFiles: string[];
  forbiddenHardcodedColors: string[];
  sourceScanFiles: string[];
  referencedUndefinedAllowlist: { token: string; reason: string }[];
  linkDialogClasses: string[];
  requiredTokens: string[];
  themeColorTokens: string[];
  layers: {
    layerStatement: {
      file: string;
      elementId: string;
      order: string[];
    };
    base: { entry: string; wrap: "source" | "import-layer" | "plugin-transform" }[];
    themeStyleElementId: string;
    userStyleElementId: string;
  };
  /** S9 点级豁免（#312）：marker + 文件 + 出现次数 + 出处（对齐 S15 innerHTMLAllowlist 的强度） */
  s9AllowMarkers: { marker: string; file: string; count: number; reason: string }[];
  runtimeStyleSources: { id: string; detect: string; reason: string }[];
  cmHostTheme: {
    files: string[];
    requiredRefs: string[];
    placeholderFont: {
      cssFile: string;
      selector: string;
      tsFile: string;
      tsConst: string;
    };
  };
  injectionFunctions: { file: string; names: string[] }[];
  innerHTMLAllowlist: { file: string; count: number; reason: string }[];
  buildAssets: { cssCount: number; requiredChunks: string[] };
}

const root = process.cwd();

export function readFixture(): ThemeEntries {
  return JSON.parse(
    readFileSync(resolve(root, "tests/fixtures/theme-entries.json"), "utf8"),
  ) as ThemeEntries;
}

/** 极简 glob：** 匹配任意层级，* 匹配段内任意字符（不含分隔符）。 */
export function expandGlob(pattern: string): string[] {
  const re = new RegExp(
    "^" +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*/g, "§DOUBLE§")
        .replace(/\*/g, "[^/]*")
        .replace(/§DOUBLE§/g, ".*") +
      "$",
  );
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = resolve(dir, name);
      const rel = relative(root, full).split(sep).join("/");
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (name === "node_modules" || name.startsWith(".")) continue;
        walk(full);
      } else if (st.isFile() && re.test(rel)) {
        out.push(rel);
      }
    }
  };
  walk(root);
  return out.sort();
}

export function expandEntries(patterns: string[]): string[] {
  return [...new Set(patterns.flatMap((p) => (p.includes("*") ? expandGlob(p) : [p])))].sort();
}

export function readSrc(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

/** 注释 → 等长空格掩码（保留换行与行列结构）。 */
export function maskComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

/** 花括号配平：取「精确选择器 + {」对应块的内容（找不到返回 null）。 */
export function balancedBlock(css: string, selector: string): string | null {
  const masked = maskComments(css);
  const needle = `${selector} {`;
  const start = masked.indexOf(needle);
  if (start === -1) return null;
  let depth = 0;
  const open = start + needle.length - 1;
  for (let i = open; i < masked.length; i++) {
    if (masked[i] === "{") depth++;
    else if (masked[i] === "}") {
      depth--;
      if (depth === 0) return masked.slice(open + 1, i);
    }
  }
  return null;
}

export function tokensInBlock(css: string, selector: string): Set<string> {
  const block = balancedBlock(css, selector);
  if (!block) return new Set();
  return new Set(
    [...block.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]),
  );
}

export function declaredTokens(source: string): Set<string> {
  return new Set(
    [...maskComments(source).matchAll(/(?:^|[\s;{])(--[\w-]+)\s*:/gm)].map(
      (m) => m[1],
    ),
  );
}

export function referencedTokens(source: string): string[] {
  return [...maskComments(source).matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
}

/** S1：清单内全部 CSS 文件的 token 定义并集（跨文件）。 */
export function definitionUnion(fixture: ThemeEntries): Set<string> {
  const set = new Set<string>();
  for (const f of expandEntries(fixture.tokenDefinitionFiles)) {
    if (!existsSync(resolve(root, f))) {
      throw new Error(`清单登记的样式入口不存在：${f}`);
    }
    for (const t of declaredTokens(readSrc(f))) set.add(t);
  }
  return set;
}

/**
 * 非颜色的关键字：出现在值里属合法（#312 命名颜色判据的白名单）。
 * 注意此处**不含** `white`/`black`/`gray` 等真颜色 —— 它们必须走 token。
 */
export const NAMED_COLOR_ALLOW = new Set([
  "transparent",
  "currentcolor",
  "inherit",
  "none",
  "initial",
  "unset",
  "revert",
  "revert-layer",
]);

/** CSS Color 4 命名色（148 个）。出现在 token 定义行之外即违规（#312 补正则盲区）。 */
const NAMED_COLORS = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen`.split(
    /\s+/,
  ),
);

/**
 * 值里是否含命名颜色（返回命中的词，便于报错）。**只看标识符本身**：
 * 用 `(?<![-\w])` 排除 `var(--gold)` / `--bg-gold` 这类自定义属性名里的同名词，
 * 避免把「token 名里带颜色词」误判成硬编码色。
 */
export function namedColorIn(value: string): string | null {
  for (const m of value.matchAll(/(?<![-\w])[a-zA-Z][\w-]*/g)) {
    const word = m[0].toLowerCase();
    if (NAMED_COLOR_ALLOW.has(word)) continue;
    if (NAMED_COLORS.has(word)) return m[0];
  }
  return null;
}

/**
 * S9：返回违反「色值仅允许出现在 token 定义行」的行。
 * 多行 token 声明（--x: … ; 跨行）按声明状态机整体放行；
 * s9-allow 标记：独立注释行豁免其下一条非空行，行内标记豁免本行。
 *
 * 色值覆盖（#312 补齐盲区，旧版只有 `#hex` 与 `rgb()/rgba()`）：
 * `#hex` / `rgb(a)()` / `hsl(a)()` / `color-mix()` / `oklch()` / `lab()` / `lch()` / `color()`，
 * 以及**命名颜色**（白名单见 `NAMED_COLOR_ALLOW`）。命名颜色只看**首个冒号之后**的值部分，
 * 避免误伤 `.orange-badge { … }` 这种选择器里带颜色词的行。
 */
export function s9Offenders(raw: string): { line: number; text: string }[] {
  const masked = maskComments(raw);
  const rawLines = raw.split("\n");
  const lines = masked.split("\n");
  const exempt = new Set<number>();
  rawLines.forEach((l, i) => {
    if (/s9-allow/.test(l)) {
      exempt.add(i);
      if (/^\s*\/\*/.test(l)) {
        let j = i + 1;
        while (j < lines.length && !lines[j].trim()) j++;
        exempt.add(j);
      }
    }
  });
  const colorRe =
    /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|color-mix\(|oklch\(|lab\(|lch\(|color\(/g;
  const out: { line: number; text: string }[] = [];
  let inTokenDecl = false;
  lines.forEach((line, i) => {
    if (/^\s*--[\w-]+\s*:/.test(line)) inTokenDecl = true;
    colorRe.lastIndex = 0;
    if (inTokenDecl || exempt.has(i)) {
      // 放行行：仍需推进多行 token 声明状态机
      if (inTokenDecl && line.includes(";")) inTokenDecl = false;
      return;
    }
    const colon = line.indexOf(":");
    const value = colon >= 0 ? line.slice(colon + 1) : "";
    if (colorRe.test(line) || namedColorIn(value) !== null) {
      out.push({ line: i + 1, text: rawLines[i].trim() });
    }
    if (inTokenDecl && line.includes(";")) inTokenDecl = false;
  });
  return out;
}

/**
 * S9 点级豁免的对账（#312 项 1，对齐 S15 `innerHTMLAllowlist` 的强度）：
 * 传入「文件 → 原文」与登记清单，返回违规列表（空数组 = 通过）。
 *
 * 登记形态：`{ marker, file, count, reason }` —— **marker + 文件 + 出现次数**三者都锁，
 * 于是「抄一行 `/* s9-allow: … *\/` 就静默通过」不再可能：
 * 新增一处 → 次数不符；换文件 → 未登记；标记过期不用 → 挂账未清。
 */
export function s9AllowViolations(
  files: { rel: string; raw: string }[],
  registry: { marker: string; file: string; count: number }[],
): string[] {
  const actual = new Map<string, number>();
  for (const { rel, raw } of files) {
    for (const m of raw.matchAll(/s9-allow:\s*([\w-]+)/g)) {
      const key = `${m[1]}@${rel}`;
      actual.set(key, (actual.get(key) ?? 0) + 1);
    }
  }
  const declared = new Map(registry.map((e) => [`${e.marker}@${e.file}`, e.count]));

  const violations: string[] = [];
  for (const [key, n] of actual) {
    if (!declared.has(key)) {
      violations.push(`未登记豁免：${key}（出现 ${n} 次）→ 请改 token，或按 {marker,file,count,reason} 登记`);
      continue;
    }
    const want = declared.get(key)!;
    if (n !== want) violations.push(`豁免次数与登记不符：${key} 实际 ${n} 次、登记 ${want} 次`);
  }
  for (const key of declared.keys()) {
    if (!actual.has(key)) violations.push(`豁免已过期（源码里已无该标记）：${key} → 请从清单删除`);
  }
  return violations;
}
