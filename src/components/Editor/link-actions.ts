// 链接动作分派（#298）
//
// 把 `classifyLink` 的纯数据结果落成副作用。依赖全部注入（openExternal / scrollToAnchor / notify），
// 因此可以在 vitest 里跑真断言，不需要挂载 Tauri 或真实浏览器。
//
// PR-2 的边界：只落 external / anchor / unsupported / empty 四条臂；
// workspace-file **显式 no-op**（#296 才接入「打开工作区文件 + pending 锚点」）。
// 这一条 no-op 在 #296 会反转为「必须打开」，反转点写在 link-actions.test.ts 的用例名上。

import type { LinkClassification, UnsupportedReason } from "../../lib/link-target";

export type LinkNoticeKind = "info" | "warning";

export interface LinkActionDeps {
  /** 外部链接：桌面端 opener / 浏览器端 window.open（由调用方按运行环境注入） */
  openExternal: (url: string) => Promise<void>;
  /** 本文档内锚点跳转；返回 false 表示未命中（未命中必须静默） */
  scrollToAnchor: (fragment: string) => boolean;
  /** 非阻塞提示（Editor.tsx 的 LinkNotice） */
  notify: (message: string, kind: LinkNoticeKind) => void;
}

/**
 * 不支持原因 → 用户可见文案。
 * 文案是对外契约（E2E 按 role="status" 的文本断言），改动需同步用例。
 */
export const UNSUPPORTED_MESSAGES: Record<UnsupportedReason, string> = {
  "local-file": "不支持 file:// 链接",
  "blocked-scheme": "不支持该协议",
  "outside-workspace": "链接目标不在工作区内",
  "not-markdown": "仅支持打开 Markdown 文件",
  "no-workspace": "未保存的草稿无法解析相对链接",
  "no-workspace-root": "没有打开工作区，无法校验该链接目标",
};

/** 执行一次链接动作。纯分派：不做判定、不做 IO 之外的兜底。 */
export function performLinkAction(cls: LinkClassification, deps: LinkActionDeps): void {
  switch (cls.kind) {
    case "empty":
      return;
    case "anchor":
      // 未命中不提示：锚点写错是文档内容问题，弹提示会打断编辑（D7）
      deps.scrollToAnchor(cls.fragment);
      return;
    case "external":
      void deps.openExternal(cls.url);
      return;
    case "unsupported":
      deps.notify(UNSUPPORTED_MESSAGES[cls.reason], "warning");
      return;
    case "workspace-file":
      // #296 落地：自链接直接滚动 / 先登记 pending-anchor 再 openFile / 失败撤销并提示。
      // PR-2 阶段该 kind 只分类、不执行——半成品入口会与编辑器自身行为抢注，故显式 no-op。
      return;
  }
}
