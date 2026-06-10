import assert from "node:assert/strict";
import { importMaterialGroup } from "../src/material-loader.js";

const calls = [];
const png = { name: "Castle.PNG" };
const result = await importMaterialGroup({
  type: "object",
  group: {
    png: [png],
    sheet: { name: "object.dat" },
    data: { name: "objectdata.dat" },
  },
  cellSource: 32,
  loadSheetFiles: async (type, sheet, data, skipNames, persist) => {
    calls.push({ kind: "sheet", type, sheet, data, skipNames, persist });
    return 3;
  },
  loadImageFile: async file => {
    calls.push({ kind: "image", file });
    return { naturalWidth: 64, naturalHeight: 96 };
  },
  registerChip: (type, chip, replace) => {
    calls.push({ kind: "register", type, chip, replace });
  },
  persistChip: async (type, chip, file) => {
    calls.push({ kind: "persist", type, chip, file });
  },
});

assert.deepEqual(result, { count: 4, warnings: [] });
assert.equal(calls[0].skipNames.has("castle"), true);
assert.equal(calls[0].persist, true);
assert.deepEqual(
  calls.find(call => call.kind === "register").chip,
  {
    name: "Castle",
    type: 1,
    width: 2,
    height: 3,
    image: { naturalWidth: 64, naturalHeight: 96 },
  }
);

const incomplete = await importMaterialGroup({
  type: "field",
  group: { png: [], sheet: { name: "field.dat" }, data: null },
  cellSource: 32,
  loadSheetFiles: async () => 0,
  loadImageFile: async () => null,
  registerChip: () => {},
  persistChip: async () => {},
});
assert.deepEqual(incomplete, {
  count: 0,
  warnings: ["フィールド: .datの組が不足"],
});

console.log("OK: material import behavior");
