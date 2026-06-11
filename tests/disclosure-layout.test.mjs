import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");

assert.match(
  css,
  /\.disclosure\s*>\s*\.button\.wide\s*\{\s*width:\s*calc\(100%\s*-\s*26px\);\s*\}/
);

console.log("OK: wide disclosure buttons account for horizontal margins");
