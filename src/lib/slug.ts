// 标题/锚点 slug 的唯一实现（#297 从 components/Editor/link-click.ts 迁出）
//
// 迁移目的：`lib/outline.ts`、`lib/heading-anchors.ts` 都需要它，留在 components 里会形成
// `lib → components` 的反向依赖。**规则本身零变更**（tests/unit/slugify.test.ts 一句不改）。

/**
 * GitHub 风格 slug：转小写、去标点、空格/下划线转连字符。
 * Unicode 感知（\p{L}\p{N}），中文等非 ASCII 字母保留。
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
