import assert from "node:assert/strict";
import {
  TOOL_PRESENTATION,
  clampPastePosition,
  fingerprintBytes,
  paletteFolderLabel,
  rectFromPoints,
  selectionSummary,
  storedBytesToBuffer,
  transformClipboardData,
  unitDimensions,
} from "../src/app-utils.js";

assert.equal(TOOL_PRESENTATION.select.label, "選択");
assert.equal(paletteFolderLabel("field"), "フィールドフォルダを読み込む");
assert.equal(paletteFolderLabel("object"), "オブジェクトフォルダを読み込む");
assert.deepEqual(unitDimensions("##"), { width: 3, height: 3 });
assert.deepEqual(unitDimensions("@ESC@"), { width: 3, height: 2 });
assert.deepEqual(unitDimensions("@"), { width: 4, height: 1 });

assert.deepEqual(
  rectFromPoints({ x: 8, y: 7 }, { x: -2, y: 12 }, 10, 10),
  { x: 0, y: 7, width: 9, height: 3 }
);
assert.deepEqual(
  clampPastePosition({ x: 9, y: -3 }, 10, 8, { width: 4, height: 3 }),
  { x: 6, y: 0 }
);

const clipboard = { width: 2, height: 3, items: [{}, {}] };
assert.equal(selectionSummary(null, null, []), "範囲未選択");
assert.equal(selectionSummary(null, clipboard, []), "コピー: 2 × 3 / 2項目");
assert.equal(
  selectionSummary(
    { x: 1, y: 1, width: 2, height: 2 },
    clipboard,
    [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }]
  ),
  "選択 2 × 2 / 2項目 / コピー 2×3"
);

const sourceClipboard = {
  width: 3,
  height: 2,
  items: [
    { name: "a", x: 0, y: 0 },
    { name: "b", x: 2, y: 1 },
  ],
};
assert.deepEqual(transformClipboardData(sourceClipboard, "right"), {
  width: 2,
  height: 3,
  items: [
    { name: "a", x: 1, y: 0 },
    { name: "b", x: 0, y: 2 },
  ],
});
assert.deepEqual(transformClipboardData(sourceClipboard, "horizontal").items, [
  { name: "a", x: 2, y: 0 },
  { name: "b", x: 0, y: 1 },
]);

const bytes = new Uint8Array([1, 2, 3]);
assert.equal(fingerprintBytes("map.map", bytes), fingerprintBytes("map.map", bytes));
assert.notEqual(fingerprintBytes("map.map", bytes), fingerprintBytes("map.map", new Uint8Array([1, 2, 4])));
assert.deepEqual(new Uint8Array(storedBytesToBuffer(bytes)), bytes);

console.log("OK: app utility behavior");
