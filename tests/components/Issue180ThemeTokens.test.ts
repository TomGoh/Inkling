import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appCss = readFileSync(resolve(process.cwd(), "src/App.css"), "utf8");
const linkDialogCss = readFileSync(
  resolve(process.cwd(), "src/components/Editor/LinkDialog.css"),
  "utf8",
);
const conflictDialogCss = readFileSync(
  resolve(process.cwd(), "src/components/FileConflict/ConflictDialog.css"),
  "utf8",
);
const deletedSnapshotsSource = readFileSync(
  resolve(process.cwd(), "src/components/Sidebar/DeletedSnapshots.tsx"),
  "utf8",
);

const definedTokens = new Set(
  Array.from(appCss.matchAll(/^\s*(--[\w-]+)\s*:/gm), (match) => match[1]),
);

function tokensInBlock(selector: string): Set<string> {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = appCss.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1];
  if (!block) return new Set();
  return new Set(
    Array.from(
      block.matchAll(/^\s*(--[\w-]+)\s*:/gm),
      (match) => match[1],
    ),
  );
}

function referencedTokens(source: string): string[] {
  return Array.from(source.matchAll(/var\(\s*(--[\w-]+)/g), (match) => match[1]);
}

const lightTokens = tokensInBlock('[data-theme="light"]');
const darkTokens = tokensInBlock('[data-theme="dark"]');
const themeColorTokens = [
  "--accent",
  "--accent-hover",
  "--accent-fg",
  "--border",
  "--text",
  "--text-muted",
  "--btn-bg",
  "--bg-elevated",
  "--bg-hover",
  "--bg-subtle",
  "--editor-bg",
  "--danger",
  "--success",
  "--warning",
  "--ring",
];

describe("Issue #180 theme contracts", () => {
  it.each([
    ["LinkDialog.css", linkDialogCss],
    ["ConflictDialog.css", conflictDialogCss],
    ["DeletedSnapshots.tsx", deletedSnapshotsSource],
  ])("%s only references declared application tokens", (_name, source) => {
    const missing = referencedTokens(source).filter((token) => !definedTokens.has(token));
    expect([...new Set(missing)]).toEqual([]);
  });

  it("declares every theme-specific component token in both built-in themes", () => {
    expect(themeColorTokens.filter((token) => !lightTokens.has(token))).toEqual([]);
    expect(themeColorTokens.filter((token) => !darkTokens.has(token))).toEqual([]);
  });

  it("LinkDialog stylesheet defines every class used for its styled controls", () => {
    for (const className of [
      "link-dialog-modal",
      "link-dialog-close",
      "link-dialog-btn-cancel",
      "link-dialog-btn-confirm",
    ]) {
      expect(linkDialogCss).toMatch(new RegExp(`\\.${className}\\b`));
    }
  });
});
