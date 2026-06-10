import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseMap, serializeMap } from "../src/formats.js";

const source = await readFile(new URL("../assets/sample.map", import.meta.url));
const parsed = parseMap(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength));
const serialized = serializeMap(parsed);

assert.equal(parsed.width, 60);
assert.equal(parsed.height, 70);
assert.deepEqual(serialized, new Uint8Array(source));

const parts = {
  width: 7,
  height: 6,
  placements: [
    { name: "grass", type: 0, x: 1, y: 2, zIndex: 0 },
    { name: "@", type: 6, x: 3, y: 4, zIndex: 1 },
  ],
};
const partsRoundTrip = parseMap(serializeMap(parts).buffer);
assert.equal(partsRoundTrip.width, 7);
assert.equal(partsRoundTrip.height, 6);
assert.deepEqual(
  partsRoundTrip.placements.map(({ name, type, x, y }) => ({ name, type, x, y })),
  parts.placements.map(({ name, type, x, y }) => ({ name, type, x, y }))
);

console.log(`OK: sample.map and clipboard .map round trips`);
