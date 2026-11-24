// Precache service worker. The build fills in VERSION and ASSETS (see vite.config.ts).
const VERSION = "__VERSION__";
const ASSETS = __ASSETS__;
const CACHE = `bend-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("bend-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  const key = request.mode === "navigate" ? "/index.html" : request;
  event.respondWith(caches.match(key, { ignoreSearch: true, ignoreVary: true }).then((hit) => hit ?? fetch(request)));
});
