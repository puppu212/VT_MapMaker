import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.webmanifest", root), "utf8"));
const serviceWorker = await readFile(new URL("sw.js", root), "utf8");

assert.equal(manifest.name, "VT MapMaker");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.start_url, "./");
assert.equal(manifest.scope, "./");
assert.equal(manifest.icons.some(icon => icon.sizes === "192x192"), true);
assert.equal(manifest.icons.some(icon => icon.sizes === "512x512"), true);
assert.equal(manifest.icons.some(icon => icon.purpose === "maskable"), true);

const shellMatch = serviceWorker.match(/const APP_SHELL = (\[[\s\S]*?\]);/);
assert.ok(shellMatch, "Service Worker cache list is missing");
const appShell = JSON.parse(shellMatch[1]);
for (const relativePath of appShell) {
  if (relativePath === "./") continue;
  const path = relativePath.replace(/^\.\//, "");
  await access(new URL(path, root));
}

for (const icon of manifest.icons) {
  const path = fileURLToPath(new URL(icon.src.replace(/^\.\//, ""), root));
  const bytes = await readFile(path);
  assert.equal(bytes.toString("ascii", 1, 4), "PNG");
  assert.equal(bytes.readUInt32BE(16), Number(icon.sizes.split("x")[0]));
  assert.equal(bytes.readUInt32BE(20), Number(icon.sizes.split("x")[1]));
}

assert.match(serviceWorker, /cache\.match\(request, \{ ignoreSearch: true \}\)/);
assert.match(serviceWorker, /request\.mode === "navigate"/);

console.log("OK: PWA manifest, icons, and offline shell");
