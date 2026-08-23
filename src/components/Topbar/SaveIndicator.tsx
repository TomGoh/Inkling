// 保存状态指示器：显示保存失败 / 保存中 / 未保存 / 已保存时间
import { useWorkspace } from "../../store/workspace";

export function SaveIndicator() {
  const dirty = useWorkspace((s) => s.dirty);
  const saving = useWorkspace((s) => s.saving);
  const saveError = useWorkspace((s) => s.saveError);
  const conflictPending = useWorkspace((s) => s.conflictPending);
  const lastSavedAt = useWorkspace((s) => s.lastSavedAt);
  const saveCurrent = useWorkspace((s) => s.saveCurrent);

  if (saveError) {
    return <span className="save-indicator save-error">保存失败：{saveError}</span>;
  }
  if (conflictPending) {
    return (
      <span
        className="save-indicator save-error"
        role="button"
        title="文件被外部程序修改，自动保存已暂停。点击进行冲突处理"
        style={{ cursor: "pointer" }}
        onClick={() => void saveCurrent({ interactive: true })}
      >
        外部冲突（已暂停自动保存）
      </span>
    );
  }
  if (saving) return <span className="save-indicator">保存中…</span>;
  if (dirty) return <span className="save-indicator">未保存</span>;
  if (lastSavedAt) {
    const t = new Date(lastSavedAt).toLocaleTimeString();
    return <span className="save-indicator save-ok">已保存 {t}</span>;
  }
  return <span className="save-indicator" />;
}
