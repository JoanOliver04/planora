const VERSION = "planora-shell-v1";
const SHELL = [
  "/",
  "/es",
  "/en",
  "/manifest.webmanifest",
  "/assets/logo.png",
  "/assets/logo_modo_claro.png",
  "/assets/logo_modo_oscuro.png",
];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("planora-") && key !== VERSION)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.includes("/login")
  )
    return;
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok)
            caches
              .open(VERSION)
              .then((cache) => cache.put(request, response.clone()));
          return response;
        })
        .catch(
          async () =>
            (await caches.match(request)) ||
            (await caches.match(
              url.pathname.startsWith("/en") ? "/en" : "/es",
            )),
        ),
    );
    return;
  }
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/assets/")
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok)
              caches
                .open(VERSION)
                .then((cache) => cache.put(request, response.clone()));
            return response;
          }),
      ),
    );
  }
});
