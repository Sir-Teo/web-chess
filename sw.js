const ASSET_VERSION = "20260214c";
const CORE_CACHE = "vulcan-core-v14";
const RUNTIME_CACHE = "vulcan-runtime-v14";
const MAX_RUNTIME_CACHE_ENTRIES = 64;

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./favicon.ico",
  `./styles.css?v=${ASSET_VERSION}`,
  "./sw.js",
  `./src/app.js?v=${ASSET_VERSION}`,
  `./src/engine.js?v=${ASSET_VERSION}`,
  `./src/uci.js?v=${ASSET_VERSION}`,
  `./vendor/chess.min.js?v=${ASSET_VERSION}`,
  "./assets/pieces/wP.png",
  "./assets/pieces/wN.png",
  "./assets/pieces/wB.png",
  "./assets/pieces/wR.png",
  "./assets/pieces/wQ.png",
  "./assets/pieces/wK.png",
  "./assets/pieces/bP.png",
  "./assets/pieces/bN.png",
  "./assets/pieces/bB.png",
  "./assets/pieces/bR.png",
  "./assets/pieces/bQ.png",
  "./assets/pieces/bK.png",
];
const CORE_PATHS = new Set(
  CORE_ASSETS.map((asset) => new URL(asset, self.location.origin).pathname)
);

function isHtmlNavigation(request) {
  if (request.mode === "navigate") return true;
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html");
}

function isImmutableVersionedAsset(url) {
  if (url.searchParams.has("v")) return true;
  return /-[0-9a-f]{7,}\.(?:js|mjs|css|wasm)$/i.test(url.pathname);
}

async function trimRuntimeCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_RUNTIME_CACHE_ENTRIES) return;
  const stale = keys.slice(0, keys.length - MAX_RUNTIME_CACHE_ENTRIES);
  await Promise.all(stale.map((key) => cache.delete(key)));
}

async function putIfOk(cache, request, response) {
  if (!response || !response.ok) return;
  await cache.put(request, response.clone());
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => ![CORE_CACHE, RUNTIME_CACHE].includes(key))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  if (!isSameOrigin) return;

  if (url.pathname.includes("/vendor/stockfish/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        const isJsWorkerScript = url.pathname.endsWith(".js");
        if (isJsWorkerScript) {
          const cached = await cache.match(request);
          if (cached) {
            if (isImmutableVersionedAsset(url)) {
              return cached;
            }
            const networkRefresh = fetch(request)
              .then(async (response) => {
                await putIfOk(cache, request, response);
                await trimRuntimeCache(cache);
                return response;
              })
              .catch(() => null);
            event.waitUntil(networkRefresh);
            return cached;
          }
          try {
            const network = await fetch(request);
            await putIfOk(cache, request, network);
            await trimRuntimeCache(cache);
            return network;
          } catch (err) {
            const fallback = await cache.match(request);
            return fallback || Response.error();
          }
        }

        const cached = await cache.match(request);
        const networkPromise = fetch(request)
          .then(async (response) => {
            await putIfOk(cache, request, response);
            await trimRuntimeCache(cache);
            return response;
          })
          .catch(() => null);
        if (cached) {
          event.waitUntil(networkPromise);
          return cached;
        }
        const network = await networkPromise;
        return network || cached || Response.error();
      })()
    );
    return;
  }

  if (isImmutableVersionedAsset(url) && !isHtmlNavigation(request)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const network = await fetch(request);
          await putIfOk(cache, request, network);
          await trimRuntimeCache(cache);
          return network;
        } catch (err) {
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  const isCoreAsset = CORE_PATHS.has(url.pathname) || isHtmlNavigation(request);
  if (isCoreAsset) {
    event.respondWith(
      (async () => {
        const coreCache = await caches.open(CORE_CACHE);
        const cached = await coreCache.match(request, { ignoreSearch: true });
        const networkPromise = fetch(request)
          .then(async (response) => {
            await putIfOk(coreCache, request, response);
            return response;
          })
          .catch(() => null);
        if (cached) {
          event.waitUntil(networkPromise);
          return cached;
        }
        const network = await networkPromise;
        if (network) return network;
        if (isHtmlNavigation(request)) {
          const htmlFallback = await coreCache.match("./index.html");
          if (htmlFallback) return htmlFallback;
        }
        return Response.error();
      })()
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
