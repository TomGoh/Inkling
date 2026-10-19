// 链接动作分派（#298 五臂；#296 补齐 workspace-file 臂）
//
// 把 `classifyLink` 的纯数据结果落成副作用。依赖全部注入（openExternal / scrollToAnchor /
// openWorkspaceFile / pending-anchor / notify），因此可以在 vitest 里跑真断言，
// 不需要挂载 Tauri、真实浏览器或 store。

import type { LinkClassification, UnsupportedReason } from "../../lib/link-target";

export type LinkNoticeKind = "info" | "warning";

export interface LinkActionDeps {
  /** 外部链接：桌面端 opener / 浏览器端 window.open（由调用方按运行环境注入） */
  openExternal: (url: string) => Promise<void>;
  /** 本文档内锚点跳转；返回 false 表示未命中（未命中必须静默） */
  scrollToAnchor: (fragment: string) => boolean;
  /** 非阻塞提示（Editor.tsx 的 LinkNotice） */
  notify: (message: string, kind: LinkNoticeKind) => void;
  /** 打开工作区文件（已打开则切 tab）；失败时 reject，并写入 fileOpenErrors */
  openWorkspaceFile: (absPath: string) => Promise<void>;
  /** 打开前登记「目标编辑器挂载后滚到锚点」（顺序必须在打开之前） */
  requestPendingAnchor: (absPath: string, fragment: string) => void;
  /** 打开失败时撤销登记，避免日后误消费 */
  cancelPendingAnchor: (absPath: string) => void;
  /** 本编辑器实例的文档路径（主 / 分屏各一份；不能用活跃 tab，否则分屏自链接会抢主 tab） */
  selfPath: string;
  /** 路径同一性（normalize + Windows 大小写折叠） */
  isSamePath: (a: string, b: string) => boolean;
  /** 打开失败的后端原因（store 的 fileOpenErrors）；没有则退回异常 message */
  getOpenError?: (absPath: string) => string | undefined;
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
    case "workspace-file": {
      // 自链接：目标就是本编辑器实例的文档。不能走 openFile（不会重挂、登记也不会被消费），
      // 也不能按「活跃 tab」判定——分屏面板渲染的是另一个实例，必须用实例自己的 selfPath。
      if (deps.isSamePath(cls.path, deps.selfPath)) {
        if (cls.fragment) deps.scrollToAnchor(cls.fragment);
        return;
      }

      // 先登记、再打开：目标编辑器会在 openFile 触发的挂载里立刻消费登记表。
      // 顺序反过来（先打开后登记）会漏掉「挂载完成早于登记」的时序。
      if (cls.fragment) deps.requestPendingAnchor(cls.path, cls.fragment);

      void Promise.resolve()
        .then(() => deps.openWorkspaceFile(cls.path))
        .catch((error: unknown) => {
          if (cls.fragment) deps.cancelPendingAnchor(cls.path);
          const detail =
            deps.getOpenError?.(cls.path) ??
            (error instanceof Error ? error.message : String(error));
          deps.notify(`无法打开：${detail || "未知错误"}`, "warning");
        });
      return;
    }
  }
}
