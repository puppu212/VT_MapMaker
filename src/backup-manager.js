import { fingerprintBytes, formatDate } from "./app-utils.js";

export function createBackupManager({
  getSnapshot,
  saveDraft,
  listBackups,
  clearBackups,
  clearDraft,
  setLabel,
  onError = console.error,
}) {
  let available = true;
  let inProgress = false;
  let lastFingerprint = "";

  function currentFingerprint(snapshot = getSnapshot()) {
    return fingerprintBytes(snapshot.filename, snapshot.bytes);
  }

  function markCurrent() {
    lastFingerprint = currentFingerprint();
  }

  function setAvailable(value) {
    available = value;
  }

  async function autoSave(force = false) {
    if (!available) {
      setLabel("ブラウザ内保存を利用できません");
      return false;
    }
    if (inProgress) return false;

    const snapshot = getSnapshot();
    const fingerprint = currentFingerprint(snapshot);
    if (!force && fingerprint === lastFingerprint) return false;

    inProgress = true;
    setLabel("保存中…");
    try {
      const saved = await saveDraft(snapshot);
      lastFingerprint = fingerprint;
      const backups = await listBackups();
      setLabel(`${formatDate(saved.savedAt)} 自動保存 / ${backups.length}件`);
      return true;
    } catch (error) {
      onError(error);
      setLabel("自動保存に失敗しました");
      return false;
    } finally {
      inProgress = false;
    }
  }

  async function updateStatus() {
    if (!available) {
      setLabel("ブラウザ内保存を利用できません");
      return;
    }
    const backups = await listBackups();
    setLabel(backups.length
      ? `バックアップ ${backups.length}件`
      : "変更時に自動保存します");
  }

  async function clearHistory() {
    await clearBackups();
    await clearDraft();
    markCurrent();
    await updateStatus();
  }

  return {
    autoSave,
    clearHistory,
    markCurrent,
    setAvailable,
    updateStatus,
  };
}
