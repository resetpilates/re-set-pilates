// Offline shell. Hashed build files are cached for good; everything else is network-first so replaced
// photos, the hero video and API answers never go stale on an installed app.
const CACHE = "reset-v4";
const HASHED = /\/assets\/index-[A-Za-z0-9_-]+\.(js|css)$/;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/manifest.webmanifest"])));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// Only complete, successful responses are cached (video range requests are 206 and must not be stored).
const store = (req, res) => {
  if (res && res.ok && res.status === 200 && !req.headers.has("range")) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
  }
  return res;
};

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  const path = new URL(req.url).pathname;
  if (path.startsWith("/api/")) return; // never cache API calls
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/")));
    return;
  }
  if (HASHED.test(path)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => store(req, res))));
    return;
  }
  e.respondWith(
    fetch(req)
      .then((res) => store(req, res))
      .catch(() => caches.match(req)),
  );
});

// Purchase notifications (see src/lib/purchase.ts) open their receipt.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => new URL(w.url).origin === location.origin);
      return win ? win.navigate(url).then((w) => w?.focus()) : self.clients.openWindow(url);
    }),
  );
});
