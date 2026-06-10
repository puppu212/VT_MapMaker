import assert from "node:assert/strict";
import { classifyFolderAsType, classifyMaterialFiles } from "../src/materials.js";

const fake = path => ({
  name: path.split("/").at(-1),
  webkitRelativePath: path,
});

const classified = classifyMaterialFiles([
  fake("pack/field/grass.png"),
  fake("pack/field/field.dat"),
  fake("pack/field/fielddata.dat"),
  fake("pack/object/castle.png"),
  fake("pack/object/object.dat"),
  fake("pack/object/objectdata.dat"),
  fake("pack/readme.txt"),
]);

assert.equal(classified.field.png.length, 1);
assert.equal(classified.field.sheet.name, "field.dat");
assert.equal(classified.field.data.name, "fielddata.dat");
assert.equal(classified.object.png.length, 1);
assert.equal(classified.object.sheet.name, "object.dat");
assert.equal(classified.object.data.name, "objectdata.dat");
assert.equal(classified.ignored.length, 1);

const singleFolder = classifyMaterialFiles([
  fake("object/gate.png"),
  fake("object/object.dat"),
]);
assert.equal(singleFolder.object.png.length, 1);
assert.equal(singleFolder.object.sheet.name, "object.dat");

const arbitraryFieldFolder = classifyFolderAsType([
  fake("好きな地形素材/grass.png"),
  fake("好きな地形素材/sub/road.PNG"),
  fake("好きな地形素材/field.dat"),
  fake("好きな地形素材/fielddata.dat"),
  fake("好きな地形素材/readme.txt"),
], "field");
assert.equal(arbitraryFieldFolder.png.length, 2);
assert.equal(arbitraryFieldFolder.sheet.name, "field.dat");
assert.equal(arbitraryFieldFolder.data.name, "fielddata.dat");
assert.equal(arbitraryFieldFolder.ignored.length, 1);

const arbitraryObjectFolder = classifyFolderAsType([
  fake("buildings/castle.png"),
  fake("buildings/object.bmp"),
  fake("buildings/objectdata.dat"),
], "object");
assert.equal(arbitraryObjectFolder.png.length, 1);
assert.equal(arbitraryObjectFolder.sheet.name, "object.bmp");
assert.equal(arbitraryObjectFolder.data.name, "objectdata.dat");

console.log("OK: material folder classification");
