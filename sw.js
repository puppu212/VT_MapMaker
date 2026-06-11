const CACHE_NAME = "vt-mapmaker-shell-v4";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./src/app.js",
  "./src/app-utils.js",
  "./src/backup-manager.js",
  "./src/formats.js",
  "./src/material-loader.js",
  "./src/materials.js",
  "./src/model.js",
  "./src/pwa.js",
  "./src/pwa-install.js",
  "./src/storage.js",
  "./src/ui-controller.js",
  "./assets/field/field.bmp",
  "./assets/field/fielddata.dat",
  "./assets/object/object.png",
  "./assets/object/objectdata.dat"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names
          .filter(name => name.startsWith("vt-mapmaker-") && name !== CACHE_NAME)
          .map(name => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === "navigate") {
      return cache.match("./index.html");
    }
    return Response.error();
  }
}
