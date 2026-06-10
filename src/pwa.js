import { detectInstallMode, installInstructions } from "./pwa-install.js";

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("./sw.js", { scope: "./" });
  } catch (error) {
    console.warn("Service Worker registration failed", error);
    return null;
  }
}

let installPrompt = null;

function setupInstallUi() {
  const button = document.getElementById("install-app");
  const dialog = document.getElementById("install-dialog");
  const message = document.getElementById("install-instructions");
  if (!button || !dialog || !message) return;

  const standalone = window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  function updateButton() {
    const mode = detectInstallMode({
      hasPrompt: Boolean(installPrompt),
      standalone,
      userAgent: window.navigator.userAgent,
      maxTouchPoints: window.navigator.maxTouchPoints,
    });
    button.hidden = mode === "installed" || mode === "unsupported";
    button.dataset.installMode = mode;
  }

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event;
    updateButton();
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    button.hidden = true;
  });

  button.addEventListener("click", async () => {
    const mode = button.dataset.installMode;
    if (mode === "prompt" && installPrompt) {
      const prompt = installPrompt;
      installPrompt = null;
      await prompt.prompt();
      const choice = await prompt.userChoice;
      button.hidden = choice.outcome === "accepted";
      if (choice.outcome !== "accepted") updateButton();
      return;
    }

    message.textContent = installInstructions(mode);
    dialog.showModal();
  });

  updateButton();
}

registerServiceWorker();
setupInstallUi();
