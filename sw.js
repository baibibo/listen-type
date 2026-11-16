const CACHE = "listen-type-pages-v5";
const SHELL = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/app.js",
  "./js/store.js",
  "./js/norm.js",
  "./js/paths.js",
  "./data/lessons.json",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

function isServiceWorkerScript(url) {
  return /\/sw\.js$/i.test(url.pathname);
}

function isAudio(url) {
  return /\/audio\//.test(url.pathname);
}

function revalidateRequest(req) {
  try {
    if (req.mode === "navigate") return req;
    return new Request(req, { cache: "no-cache" });
  } catch {
    return req;
  }
}

function networkFirst(req, fallbackUrl) {
  return fetch(revalidateRequest(req))
    .then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
      }
      return res;
    })
    .catch(() =>
      caches.match(req).then((cached) => cached || (fallbackUrl ? caches.match(fallbackUrl) : undefined))
    );
}

function cacheFirst(req) {
  return caches.match(req).then((cached) => {
    if (cached) return cached;
    return fetch(req).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
      }
      return res;
    });
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (isServiceWorkerScript(url)) return;

  if (isAudio(url)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  event.respondWith(networkFirst(req, "./index.html"));
});
