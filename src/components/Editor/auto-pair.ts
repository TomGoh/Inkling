// 自动配对补全插件
// 输入左括号/引号时自动补全右半部分，光标置于中间。
// 选中文本时输入配对符号会用左右符号包裹选区。
// 代码块/数学公式内不触发，避免干扰代码输入。
// 通过 useSettings.getState().autoPair 实时读取开关，无需重建编辑器。

import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import { useSettings } from "../../store/settings";

/** 左符号 → 右符号 配对表（含中英文括号与引号） */
const PAIRS: Record<string, string> = {
  "(": ")",
  "[": "]",
  "{": "}",
  '"': '"',
  "'": "'",
  "「": "」",
  "『": "』",
  "（": "）",
  "【": "】",
  "《": "》",
};

/** 右符号集合，用于跳过逻辑：光标后是右符号时输入右符号只移动光标 */
const RIGHT_SYMBOLS = new Set(Object.values(PAIRS));

export const autoPairKey = new PluginKey("inkling-auto-pair");

export function autoPairPlugin(): Plugin {
  return new Plugin({
    key: autoPairKey,
    props: {
      // 拦截文本输入（不含换行、删除等）
      handleTextInput: (view, from, to, text) => {
        if (!useSettings.getState().autoPair) return false;
        const right = PAIRS[text];
        // 输入的是右符号且光标后紧跟相同右符号：跳过插入，仅移动光标
        if (!right && RIGHT_SYMBOLS.has(text)) {
          const after = view.state.doc.textBetween(to, to + 1, "", "");
          if (after === text) {
            const $to = view.state.doc.resolve(to + 1);
            view.dispatch(
              view.state.tr.setSelection(TextSelection.near($to, -1)).scrollIntoView(),
            );
            return true;
          }
          return false;
        }
        if (!right) return false;

        // 代码块/数学节点内不触发
        if (isInCodeOrMath(view.state.selection.$from)) return false;

        // 选区非空：用左右符号包裹选中文本
        if (from !== to) {
          const tr = view.state.tr;
          tr.insertText(right, to);
          tr.insertText(text, from);
          // 选区收缩到包裹内容内部
          tr.setSelection(
            TextSelection.create(tr.doc, from + 1, to + 1),
          );
          view.dispatch(tr.scrollIntoView());
          return true;
        }
        // 无选区：插入 左+右，光标置于中间
        const tr = view.state.tr;
        tr.insertText(text + right, from);
        tr.setSelection(TextSelection.near(view.state.doc.resolve(from + 1), -1));
        view.dispatch(tr.scrollIntoView());
        return true;
      },
      // 删除键：光标在配对符号中间时，同时删除左右符号
      handleKeyDown: (view, event) => {
        if (!useSettings.getState().autoPair) return false;
        if (event.key !== "Backspace") return false;
        const { selection } = view.state;
        if (!selection.empty) return false;
        const pos = selection.from;
        if (pos < 1) return false;
        const before = view.state.doc.textBetween(pos - 1, pos, "", "");
        const after = view.state.doc.textBetween(pos, pos + 1, "", "");
        if (before && after && PAIRS[before] === after) {
          view.dispatch(view.state.tr.delete(pos - 1, pos + 1));
          return true;
        }
        return false;
      },
    },
  });
}

/** 判断位置是否在代码块或数学公式节点内 */
function isInCodeOrMath($pos: { parent: { type: { name: string } } }): boolean {
  const name = $pos.parent.type.name;
  return name === "code_block" || name === "math_inline" || name === "math_display";
}
