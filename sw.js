// Network-first: always fresh when online, falls back to the last cached copy when offline. API calls are never cached.
const CACHE = "lisa-v3";
const SHELL = ["/", "/index.html", "/style.css", "/script.js", "/facts.js", "/manifest.webmanifest", "/photos/lisa.jpg", "/photos/creator.jpg", "/icons/icon-192.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/") || u.pathname.startsWith("/admin") || u.pathname.startsWith("/downloads/") || u.pathname.startsWith("/.well-known/")) return;
  e.respondWith(
    fetch(r).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); }
      return res;
    }).catch(() => caches.match(r).then(m => m || (r.mode === "navigate" ? caches.match("/index.html") : Response.error())))
  );
});

self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  const title = data.title || "Lisa AI";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "Lisa की तरफ़ से नया संदेश 💜",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url || "/" }
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list => {
    for (const client of list) if (client.url.startsWith(self.location.origin) && "focus" in client) {
      client.navigate(target); return client.focus();
    }
    return clients.openWindow(target);
  }));
});
