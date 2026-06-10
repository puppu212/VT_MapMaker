import assert from "node:assert/strict";
import { detectInstallMode, installInstructions } from "../src/pwa-install.js";

assert.equal(detectInstallMode({ standalone: true, hasPrompt: true }), "installed");
assert.equal(detectInstallMode({ hasPrompt: true }), "prompt");
assert.equal(detectInstallMode({
  userAgent: "Mozilla/5.0 (iPhone) AppleWebKit Safari",
}), "ios");
assert.equal(detectInstallMode({
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit Safari",
  maxTouchPoints: 5,
}), "ios");
assert.equal(detectInstallMode({
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X) Version/18.0 Safari/605.1.15",
}), "safari");
assert.equal(detectInstallMode({
  userAgent: "Mozilla/5.0 Chrome/125.0 Safari/537.36",
}), "unsupported");

assert.match(installInstructions("ios"), /ホーム画面に追加/);
assert.match(installInstructions("safari"), /Dockに追加/);

console.log("OK: PWA install modes and instructions");
