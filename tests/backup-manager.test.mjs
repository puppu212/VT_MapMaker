import assert from "node:assert/strict";
import { createBackupManager } from "../src/backup-manager.js";

let bytes = new Uint8Array([1, 2, 3]);
let saved = [];
let backups = [];
let label = "";
let cleared = 0;

const manager = createBackupManager({
  getSnapshot: () => ({
    filename: "test.map",
    width: 10,
    height: 10,
    bytes,
  }),
  saveDraft: async record => {
    saved.push(record);
    backups.push(record);
    return { ...record, savedAt: 1_700_000_000_000 };
  },
  listBackups: async () => backups,
  clearBackups: async () => {
    backups = [];
    cleared += 1;
  },
  clearDraft: async () => {
    cleared += 1;
  },
  setLabel: value => {
    label = value;
  },
});

manager.markCurrent();
assert.equal(await manager.autoSave(), false);
bytes = new Uint8Array([1, 2, 4]);
assert.equal(await manager.autoSave(), true);
assert.equal(saved.length, 1);
assert.match(label, /自動保存 \/ 1件$/);
assert.equal(await manager.autoSave(), false);
assert.equal(await manager.autoSave(true), true);
assert.equal(saved.length, 2);

await manager.clearHistory();
assert.equal(cleared, 2);
assert.equal(label, "変更時に自動保存します");

manager.setAvailable(false);
assert.equal(await manager.autoSave(true), false);
assert.equal(label, "ブラウザ内保存を利用できません");

console.log("OK: backup manager behavior");
