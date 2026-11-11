// Network-first: always fresh when online, falls back to the last cached copy when offline. API calls are never cached.
const CACHE = "lisa-v1";
const SHELL = ["/", "/index.html", "/style.css", "/script.js", "/facts.js", "/manifest.webmanifest", "/photos/lisa.jpg", "/photos/creator.jpg", "/icons/icon-192.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/") || u.pathname.startsWith("/admin")) return;
  e.respondWith(
    fetch(r).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); }
      return res;
    }).catch(() => caches.match(r).then(m => m || (r.mode === "navigate" ? caches.match("/index.html") : Response.error())))
  );
});
