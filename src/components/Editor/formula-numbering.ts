// 公式自动编号插件
// 启用后给块级公式（math_display）按文档出现顺序设置 number attr (1,2,3...)，
// NodeView 读取 number 渲染 \tag{n}。关闭时清为 null。
// 通过 appendTransaction 在文档变更后自动校正编号，无需用户手动维护。
// 开关切换时由 Editor 组件 dispatch 一个带 recalc meta 的空 tr 触发重算。

import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { useSettings } from "../../store/settings";

export const formulaNumberingKey = new PluginKey("inkling-formula-numbering");

/** 收集需要修正的 math_display 节点位置与目标 attrs */
interface PendingFix {
  pos: number;
  attrs: Record<string, unknown>;
}

/**
 * 重新计算所有 math_display 节点的 number attr。
 * 返回待修正项数组（空数组表示无需变更）。
 */
function collectFixes(doc: import("@milkdown/kit/prose/model").Node, enabled: boolean): PendingFix[] {
  const fixes: PendingFix[] = [];
  let counter = 0;
  doc.descendants((node, pos) => {
    if (node.type.name !== "math_display") return true;
    counter++;
    const expected: number | null = enabled ? counter : null;
    if (node.attrs.number !== expected) {
      fixes.push({ pos, attrs: { ...node.attrs, number: expected } });
    }
    return true;
  });
  return fixes;
}

export const formulaNumberingPlugin = () =>
  new Plugin({
    key: formulaNumberingKey,
    appendTransaction: (_trs, _oldState, newState) => {
      const enabled = useSettings.getState().formulaAutoNumber;
      const fixes = collectFixes(newState.doc, enabled);
      if (fixes.length === 0) return null;
      const tr = newState.tr;
      // 从后往前 setNodeMarkup，避免位置偏移影响（atom 节点改 attr 不改尺寸，但稳妥起见逆序）
      for (let i = fixes.length - 1; i >= 0; i--) {
        const f = fixes[i];
        tr.setNodeMarkup(f.pos, undefined, f.attrs);
      }
      return tr;
    },
  });
