/**
 * One service worker doing two jobs: cross-origin isolation, and offline.
 *
 * This app used to register `coi-serviceworker`, whose whole purpose is to add
 * COOP/COEP to its own responses so the page becomes cross-origin isolated and
 * `SharedArrayBuffer` — and therefore multi-threaded Stockfish — is available
 * on a host that cannot send those headers. GitHub Pages is exactly that host.
 *
 * Offline support could not simply be added alongside it: a second worker
 * registered at the same scope replaces the first, so dropping web-katrain's
 * caching worker in would have silently taken isolation away and dropped every
 * threaded engine profile back to one thread, with no error anywhere. That is
 * why the cross-app plan had this item blocked. The two jobs have to live in
 * one fetch handler, and this is it.
 *
 * The half that is easy to get wrong: a response served from the cache has to
 * carry the isolation headers too. Cache the *augmented* response, never the
 * raw one, or the first offline load quietly loses isolation.
 *
 * Strategy is network-first for everything, falling back to the cache. Not
 * cache-first: the engine assets are hashed and immutable so the HTTP cache
 * already makes repeat loads fast, while network-first means an online reader
 * can never be served a stale bundle after a deploy. The cache exists for the
 * offline case, not for speed.
 */
const CACHE_VERSION = 'web-chess-v1';
const CACHE_NAME = `${CACHE_VERSION}:runtime`;

/** The document to fall back to when a navigation cannot reach the network. */
const APP_SHELL_URL = './index.html';

let coepCredentialless = false;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.add(APP_SHELL_URL))
      // A first install with no network must not fail the whole worker; the
      // shell is filled in by the first successful navigation instead.
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(
        keys.filter((key) => !key.startsWith(CACHE_VERSION)).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data) return;
  if (data.type === 'coepCredentialless') {
    coepCredentialless = Boolean(data.value);
  }
  if (data.type === 'deregister') {
    self.registration.unregister().then(() => self.clients.matchAll()).then((clients) => {
      clients.forEach((client) => client.navigate(client.url));
    });
  }
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/**
 * The headers that make the page cross-origin isolated, copied onto a response.
 * An opaque response (status 0) has no readable headers and is passed through,
 * which is what coi-serviceworker does.
 */
function withIsolationHeaders(response) {
  if (response.status === 0) return response;

  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Embedder-Policy', coepCredentialless ? 'credentialless' : 'require-corp');
  if (!coepCredentialless) headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isCacheable(request, url) {
  return request.method === 'GET' && url.origin === self.location.origin;
}

async function respond(event) {
  const request = event.request;
  const url = new URL(request.url);

  const networkRequest = coepCredentialless && request.mode === 'no-cors'
    ? new Request(request, { credentials: 'omit' })
    : request;

  const cacheable = isCacheable(request, url);
  // Every navigation shares one cache entry: the URL carries a FEN or a game in
  // its hash and query, and caching each of those separately would fill the
  // cache with copies of one document.
  const cacheKey = request.mode === 'navigate' ? APP_SHELL_URL : request;

  try {
    const response = await fetch(networkRequest);
    const isolated = withIsolationHeaders(response);

    if (cacheable && response.ok) {
      // Store the response that already carries the headers, so an offline
      // load is isolated too. clone() before the body is read by the page.
      const copy = isolated.clone();
      event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, copy)));
    }

    return isolated;
  } catch (error) {
    if (cacheable) {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const shell = await cache.match(APP_SHELL_URL);
        if (shell) return shell;
      }
    }
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  // coi-serviceworker's guard, kept: a cross-origin `only-if-cached` request
  // cannot be served by a worker, and answering it throws.
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

  event.respondWith(respond(event));
});
