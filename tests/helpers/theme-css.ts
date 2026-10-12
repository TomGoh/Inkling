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
 * 色值函数族（#327：**显式列举**，不再依赖 `lab(`/`lch(` 是 `oklab(`/`oklch(` 的子串这种隐性覆盖）。
 * 来源：CSS Color 4/5 + 常见厂商函数。
 */
export const COLOR_FUNCTIONS = [
  "rgb",
  "rgba",
  "hsl",
  "hsla",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "color",
  "color-mix",
  "color-contrast",
  "contrast-color",
  "light-dark",
  "device-cmyk",
];

/** 行内是否出现色值函数调用（返回函数名，便于报错）。 */
export function colorFunctionIn(line: string): string | null {
  for (const fn of COLOR_FUNCTIONS) {
    if (new RegExp(`(^|[^\\w-])${fn}\\s*\\(`).test(line)) return fn;
  }
  return null;
}

/** 颜色类属性（#327：命名色判据只在**这些属性**上启用，避免字体栈/动画名/`content` 里的颜色词误报）。 */
const COLOR_PROP_RE =
  /^(color|background|background-color|background-image|border|border-color|border-(top|right|bottom|left)(-color)?|outline|outline-color|fill|stroke|box-shadow|text-shadow|caret-color|accent-color|text-decoration-color|column-rule|column-rule-color|scrollbar-color|stop-color|flood-color|lighting-color|--.*)$/;

/** 去掉引号内字符串（`content: "gold"` 这类不该被当成硬编码色） */
function stripStrings(s: string): string {
  return s.replace(/"[^"]*"|'[^']*'/g, "");
}

/**
 * 从一行里取出「属性 + 值」候选（按 `;` 分段，每段取**最后一个** `:` —— 这样
 * `a:hover { color: gold }` 也能正确取到 `color`）。返回 null 表示这行不是声明形态。
 */
function declCandidates(line: string): { prop: string; value: string }[] {
  const out: { prop: string; value: string }[] = [];
  for (const seg of line.split(";")) {
    const i = seg.lastIndexOf(":");
    if (i < 0) continue;
    const m = /([-\w]+)\s*$/.exec(seg.slice(0, i));
    if (!m) continue;
    out.push({ prop: m[1].toLowerCase(), value: stripStrings(seg.slice(i + 1)) });
  }
  return out;
}

/**
 * 值里是否含命名颜色（返回命中的词，便于报错）。两道收口（#327）：
 * ① 只扫**去掉引号字符串后**的值（`content: "gold"` 不再误报）；
 * ② 只在**颜色类属性**上判（`font-family: Linen, serif` / `animation: snow 2s` 不再误报）。
 * 另用 `(?<![-\w])` 排除 `var(--gold)` / `--bg-gold` 这类自定义属性名里的同名词。
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
 * 色值覆盖（#312 补盲区，#327 补两侧边界）：
 * - `#hex`；
 * - **色值函数族**（`COLOR_FUNCTIONS` 显式列举：`rgb(a)` / `hsl(a)` / `hwb` / `lab` / `lch` /
 *   `oklab` / `oklch` / `color` / `color-mix` / `color-contrast` / `light-dark` / `device-cmyk` …）
 *   —— 不再依赖「`lab(` 是 `oklab(` 子串」这类隐性覆盖；
 * - **命名颜色**（白名单见 `NAMED_COLOR_ALLOW`）：只扫**颜色类属性**的值、且先剥引号字符串，
 *   于是 `font-family: Linen, serif` / `animation: snow 2s` / `content: "gold"` 不再误报。
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
  const hexRe = /#[0-9a-fA-F]{3,8}\b/g;
  const out: { line: number; text: string }[] = [];
  let inTokenDecl = false;
  lines.forEach((line, i) => {
    if (/^\s*--[\w-]+\s*:/.test(line)) inTokenDecl = true;
    if (inTokenDecl || exempt.has(i)) {
      // 放行行：仍需推进多行 token 声明状态机
      if (inTokenDecl && line.includes(";")) inTokenDecl = false;
      return;
    }
    hexRe.lastIndex = 0;
    const hasFunction = colorFunctionIn(line) !== null;
    const hasNamed = declCandidates(line).some(
      ({ prop, value }) => COLOR_PROP_RE.test(prop) && namedColorIn(value) !== null,
    );
    if (hexRe.test(line) || hasFunction || hasNamed) {
      out.push({ line: i + 1, text: rawLines[i].trim() });
    }
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
