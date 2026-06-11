import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const header = html.match(/<header class="app-header">([\s\S]*?)<\/header>/)?.[1] ?? "";
const backup = html.match(/<summary>バックアップ<\/summary>([\s\S]*?)<\/details>/)?.[1] ?? "";

assert.match(header, /id="install-app"[^>]*>インストール<\/button>/);
assert.doesNotMatch(backup, /id="install-app"/);
assert.ok(header.indexOf('id="install-app"') < header.indexOf('id="new-map"'));
assert.ok(header.indexOf('id="new-map"') < header.indexOf('id="open-map"'));
assert.ok(header.indexOf('id="open-map"') < header.indexOf('id="save-map"'));

console.log("OK: install and file actions are ordered in the app header");
