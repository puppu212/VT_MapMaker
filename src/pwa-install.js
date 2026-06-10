export function detectInstallMode({
  hasPrompt = false,
  standalone = false,
  userAgent = "",
  maxTouchPoints = 0,
} = {}) {
  if (standalone) return "installed";
  if (hasPrompt) return "prompt";

  const ios = /iphone|ipad|ipod/i.test(userAgent) ||
    (/macintosh/i.test(userAgent) && maxTouchPoints > 1);
  if (ios) return "ios";

  const safari = /safari/i.test(userAgent) &&
    !/chrome|chromium|crios|android|edg/i.test(userAgent);
  return safari ? "safari" : "unsupported";
}

export function installInstructions(mode) {
  if (mode === "ios") {
    return "Safariの共有ボタンを押し、「ホーム画面に追加」を選んでください。";
  }
  if (mode === "safari") {
    return "Safariの「ファイル」メニューから「Dockに追加」を選んでください。";
  }
  return "";
}
