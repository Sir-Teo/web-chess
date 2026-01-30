const CORE_CACHE = "vulcan-core-v1";
const RUNTIME_CACHE = "vulcan-runtime-v1";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./sw.js",
  "./src/app.js",
  "./src/engine.js",
  "./src/uci.js",
  "./vendor/chess.min.js",
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

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE).then((cache) => cache.addAll(CORE_ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![CORE_CACHE, RUNTIME_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    )
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (isSameOrigin && url.pathname.includes("/vendor/stockfish/")) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
