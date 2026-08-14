const VERSION = "planora-shell-v2";
const SHELL = [
  "/",
  "/es",
  "/en",
  "/manifest.webmanifest",
  "/assets/logo.webp",
  "/assets/logo_modo_claro.webp",
  "/assets/logo_modo_oscuro.webp",
];
const PUBLIC_NAVIGATION = new Set([
  "/",
  "/es",
  "/en",
  "/es/privacy",
  "/en/privacy",
  "/es/terms",
  "/en/terms",
]);

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
    if (!PUBLIC_NAVIGATION.has(url.pathname)) return;
    event.respondWith(
      fetch(request)
        .then((response) => {
          const cacheControl = response.headers.get("cache-control") ?? "";
          if (response.ok && !/private|no-store/i.test(cacheControl))
            event.waitUntil(
              caches
                .open(VERSION)
                .then((cache) => cache.put(request, response.clone())),
            );
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
              event.waitUntil(
                caches
                  .open(VERSION)
                  .then((cache) => cache.put(request, response.clone())),
              );
            return response;
          }),
      ),
    );
  }
});

// Allow only known in-app routes from notification payloads (reminders + Focus).
const NOTIFICATION_PATH =
  /^\/(?:es|en)\/(?:reminders|focus|summary)(?:\?[^#]*)?$/;

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requested = event.notification.data?.url;
  const target =
    typeof requested === "string" && NOTIFICATION_PATH.test(requested)
      ? requested
      : "/es/reminders";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((client) => "focus" in client);
        return existing
          ? existing.navigate(target).then(() => existing.focus())
          : self.clients.openWindow(target);
      }),
  );
});
