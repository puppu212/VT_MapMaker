import assert from "node:assert/strict";
import { MapDocument } from "../src/model.js";

const map = new MapDocument(10, 10);
const grass = { name: "grass", type: 0 };
const sand = { name: "sand", type: 0 };

map.checkpoint();
assert.equal(map.place(grass, 2, 3), true);
assert.equal(map.placements.length, 1);
assert.equal(map.undo(), true);
assert.equal(map.placements.length, 0);
assert.equal(map.redo(), true);
assert.equal(map.placements.length, 1);

map.checkpoint();
assert.equal(map.floodFill(sand, 0, 0), true);
assert.equal(map.placements.filter(item => item.name === "sand").length, 99);
assert.equal(map.placements.filter(item => item.name === "grass").length, 1);

map.checkpoint();
assert.equal(map.erase(2, 3), true);
assert.equal(map.itemsAt(2, 3).length, 0);

const objects = new MapDocument(20, 20);
const castle = { name: "castle", type: 1, width: 4, height: 3 };
const gate = { name: "gate", type: 1, width: 2, height: 2 };
assert.equal(objects.place(castle, 8, 8), true);
assert.equal(objects.place(gate, 9, 8), false);
assert.equal(objects.place(gate, 9, 8, null, { allowObjectOverlap: true }), true);
assert.equal(objects.itemsCovering(6, 6).some(item => item.name === "castle"), true);
assert.equal(objects.erase(6, 6), true);
assert.equal(objects.placements.some(item => item.name === "castle"), false);
assert.equal(objects.erase(8, 7), true);
assert.equal(objects.placements.some(item => item.name === "gate"), false);

const expanded = new MapDocument(10, 10);
expanded.place(grass, 1, 1);
assert.equal(expanded.expand(2, 3, 1, 4), true);
assert.equal(expanded.width, 17);
assert.equal(expanded.height, 13);
assert.equal(expanded.itemsAt(4, 3)[0].name, "grass");

expanded.checkpoint();
assert.equal(expanded.paste([
  { name: "sand", type: 0, width: 1, height: 1, x: 0, y: 0 },
  { name: "@", type: 6, width: 4, height: 1, x: 1, y: 0 },
], 5, 5), true);
assert.equal(expanded.itemsAt(5, 5)[0].name, "sand");
assert.equal(expanded.itemsAt(6, 5)[0].name, "@");
assert.equal(expanded.erase(6, 5, { protectUnits: true }), false);
assert.equal(expanded.itemsAt(6, 5)[0].name, "@");
assert.equal(expanded.erase(6, 5), true);

const bounded = new MapDocument(10, 10);
const wall = { name: "wall", type: 1, width: 1, height: 1 };
for (let x = 2; x <= 6; x++) {
  bounded.place(wall, x, 2, null, { allowObjectOverlap: true });
  bounded.place(wall, x, 6, null, { allowObjectOverlap: true });
}
for (let y = 3; y <= 5; y++) {
  bounded.place(wall, 2, y, null, { allowObjectOverlap: true });
  bounded.place(wall, 6, y, null, { allowObjectOverlap: true });
}
assert.equal(bounded.floodFillWithinObjects(sand, 4, 4), true);
assert.equal(bounded.placements.filter(item => item.name === "sand").length, 9);

console.log("OK: placement, history, fill, bounded fill, overlap, footprint erase, expand, paste");
