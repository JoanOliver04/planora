const BUILD = new URL(self.location.href).searchParams.get("v") || "dev";
const VERSION = "planora-assets-" + BUILD;
const PRECACHE = [
  "/",
  "/es",
  "/en",
  "/manifest.webmanifest",
  "/assets/logo.webp",
  "/assets/logo_modo_claro.webp",
  "/assets/logo_modo_oscuro.webp",
  "/icon-192.png",
  "/icon-512.png",
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

function isRscRequest(request, url) {
  return (
    request.headers.get("RSC") === "1" ||
    request.headers.get("Next-Router-Prefetch") === "1" ||
    url.searchParams.has("_rsc")
  );
}

function clearPlanoraCaches() {
  return caches.keys().then((keys) =>
    Promise.all(
      keys
        .filter((key) => key.startsWith("planora-") && key !== VERSION)
        .map((key) => caches.delete(key)),
    ),
  );
}

function clearAllPlanoraCaches() {
  return caches.keys().then((keys) =>
    Promise.all(
      keys
        .filter((key) => key.startsWith("planora-"))
        .map((key) => caches.delete(key)),
    ),
  );
}

function notifyClients() {
  return self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((clients) => {
      clients.forEach((client) =>
        client.postMessage({ type: "planora-sw-activated", build: BUILD }),
      );
    });
}

function networkFirstPublicNavigation(event, request) {
  return fetch(request)
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
          new URL(request.url).pathname.startsWith("/en") ? "/en" : "/es",
        )),
    );
}

function networkFirstAsset(event, request) {
  return fetch(request)
    .then((response) => {
      if (response.ok)
        event.waitUntil(
          caches
            .open(VERSION)
            .then((cache) => cache.put(request, response.clone())),
        );
      return response;
    })
    .catch(async () => (await caches.match(request)) || Response.error());
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(PRECACHE)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clearPlanoraCaches().then(() => notifyClients()));
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "planora-clear-asset-cache")
    event.waitUntil(clearAllPlanoraCaches());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.includes("/login") ||
    isRscRequest(request, url)
  )
    return;

  if (request.mode === "navigate") {
    if (!PUBLIC_NAVIGATION.has(url.pathname)) return;
    event.respondWith(networkFirstPublicNavigation(event, request));
    return;
  }

  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/assets/") ||
    url.pathname === "/icon-192.png" ||
    url.pathname === "/icon-512.png" ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(networkFirstAsset(event, request));
  }
});

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
