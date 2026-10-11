// #312 项 3：S16 产物清单对账 —— 脚本与清单**同源**（不再硬编码），并对判据打负例。
// 真实产物断言仍由 scripts/check-theme-build-assets.mjs 在「清空 dist → vite build」后执行（CI 第 15 步）。
import { describe, expect, it } from "vitest";
import {
  isMinifiedSingleLine,
  readThemeEntries,
  reconcileBuildAssets,
  // @ts-ignore -- 纯 JS 模块（S16 脚本与单测共用同一实现），不带类型声明
} from "../../scripts/lib/theme-build-assets.mjs";

const manifest = readThemeEntries().buildAssets as {
  cssCount: number;
  requiredChunks: string[];
};

const OK_FILES = ["index-abc123.css", "vendor_milkdown-def456.css", "vendor_katex-ghi789.css"];

describe("#312 项 3：S16 清单对账", () => {
  it("清单本身可读，且 cssCount / requiredChunks 齐备（脚本读的就是它）", () => {
    expect(manifest.cssCount).toBeGreaterThan(0);
    expect(manifest.requiredChunks.length).toBeGreaterThan(0);
    expect(manifest.requiredChunks).toContain("vendor_katex");
  });

  it("正当产物：数量与必需 chunk 都符合 → 无违规", () => {
    expect(reconcileBuildAssets(OK_FILES, manifest)).toEqual([]);
  });

  it.each([
    ["数量少一个（缺 vendor_katex）", ["index-abc123.css", "vendor_milkdown-def456.css"]],
    ["数量多一个", [...OK_FILES, "extra-zzz.css"]],
    ["数量够但缺某个必需 chunk", ["index-abc123.css", "vendor_milkdown-def456.css", "other-x.css"]],
    ["空产物", []],
  ])("负例（%s）必须报出违规", (_name, files) => {
    expect(reconcileBuildAssets(files as string[], manifest).length).toBeGreaterThan(0);
  });

  it("改清单即改判据（把 requiredChunks 换成别的名字 → 正当产物立刻失败）", () => {
    const fake = { cssCount: manifest.cssCount, requiredChunks: ["nope"] };
    const v = reconcileBuildAssets(OK_FILES, fake);
    expect(v.some((m: string) => m.includes("缺少 nope"))).toBe(true);
  });
});

describe("#312 项 3：压缩形态判据", () => {
  it("esbuild 压缩产物（单行，可带尾换行）→ 通过", () => {
    expect(isMinifiedSingleLine("@layer base{.a{color:red}}")).toBe(true);
    expect(isMinifiedSingleLine("@layer base{.a{color:red}}\n")).toBe(true);
  });

  it("多行产物 → 失败（旧判据「换行数 > 2」会放过的 1–2 个换行现在也被拦住）", () => {
    expect(isMinifiedSingleLine("@layer base{\n.a{color:red}\n}")).toBe(false);
    expect(isMinifiedSingleLine(".a{color:red}\n.b{color:blue}\n")).toBe(false);
  });
});
