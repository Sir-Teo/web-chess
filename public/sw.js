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
 * can never be served a stale bundle after a deploy.
 *
 * The fallback is on a timeout, not only on failure. A network that fails is
 * the easy case and was always handled -- measured at 37ms to a working board.
 * A network that *hangs* is the common one: hotel wifi, a captive portal, a
 * tunnel, one bar. `fetch` never rejects there, so a worker that waits for it
 * waits for ever. Measured before this: 45 seconds and still a blank page,
 * with a complete cache sitting unread.
 *
 * So a request that has something cached races the network against
 * {@link NETWORK_TIMEOUT_MS}, and the in-flight fetch is kept alive past the
 * response, so a reader served from the cache still refreshes it for next
 * time. A request with nothing cached waits, because waiting is the only
 * option it has.
 */
const CACHE_VERSION = 'web-chess-v1';
const CACHE_NAME = `${CACHE_VERSION}:runtime`;

/**
 * How long a reader waits for the network before a cached copy beats a blank
 * page. Only ever reached when there is something cached to fall back to.
 *
 * Being eager is safe here, which is not obvious. A deploy changes the hash in
 * every asset filename, so a new bundle is a cache *miss* -- and a miss waits
 * for the network however slow it is. Only the handful of unhashed files can
 * be served stale at all, and each of them refreshes the cache on the way
 * past, so the staleness lasts exactly one load.
 */
const NETWORK_TIMEOUT_MS = 2500;

/**
 * The timeout once the network has already failed a race.
 *
 * A page load is a chain of requests, and paying the full timeout on each in
 * turn is most of the wait: with one flat timeout, lie-fi took 8s to show a
 * board it could have drawn from cache immediately. One timeout is evidence
 * about the connection, not about the request, so the ones behind it give up
 * quickly.
 */
const SLOW_NETWORK_TIMEOUT_MS = 400;

/** How long that evidence is worth acting on. */
const SLOW_NETWORK_MEMORY_MS = 20_000;

let lastNetworkTimeoutAt = 0;

function currentTimeoutMs() {
  const recent = Date.now() - lastNetworkTimeoutAt < SLOW_NETWORK_MEMORY_MS;
  return recent ? SLOW_NETWORK_TIMEOUT_MS : NETWORK_TIMEOUT_MS;
}

/** Distinct from any Response, so the race can say which branch won. */
const TIMED_OUT = Symbol('timed out');
const NETWORK_FAILED = Symbol('network failed');

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

/**
 * Whether a response may go in the cache.
 *
 * `response.ok` is not the test: it is true for 206 Partial Content, and
 * `cache.put()` throws on those — "Partial response (status code 206) is
 * unsupported". A browser issues Range requests for exactly the assets this app
 * is largest in, the 7MB engine `.wasm`, so caching on `.ok` alone meant a
 * rejected promise inside `waitUntil` on a perfectly normal request. Checked in
 * a browser: `new Response('', { status: 206 }).ok` is `true`, and putting one
 * rejects.
 */
function isStorableResponse(response) {
  return response.status === 200;
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

  const fromNetwork = fetch(networkRequest).then((response) => {
    const isolated = withIsolationHeaders(response);

    if (cacheable && isStorableResponse(response)) {
      // Store the response that already carries the headers, so an offline
      // load is isolated too. clone() before the body is read by the page.
      const copy = isolated.clone();
      event.waitUntil(
        caches
          .open(CACHE_NAME)
          .then((cache) => cache.put(cacheKey, copy))
          // Quota is the realistic failure here, and a cache miss later is a
          // far better outcome than a rejected fetch event now.
          .catch(() => undefined)
      );
    }

    return isolated;
  });

  // Nothing to fall back to: the network is the only answer there is, and a
  // rejection here is the network error the reader should see.
  if (!cacheable) return fromNetwork;

  const cached = await caches
    .open(CACHE_NAME)
    .then((cache) => cache.match(cacheKey))
    .catch(() => undefined);
  if (!cached) return fromNetwork;

  // Keep the fetch running whichever branch wins, so a reader served from the
  // cache still leaves a fresh copy behind for the next load.
  event.waitUntil(fromNetwork.catch(() => undefined));

  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), currentTimeoutMs());
  });

  const winner = await Promise.race([fromNetwork.catch(() => NETWORK_FAILED), deadline]);
  clearTimeout(timer);

  if (winner === TIMED_OUT) {
    lastNetworkTimeoutAt = Date.now();
    return cached;
  }
  if (winner === NETWORK_FAILED) return cached;

  // The network answered in time, so whatever it was is over.
  lastNetworkTimeoutAt = 0;
  return winner;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  // coi-serviceworker's guard, kept: a cross-origin `only-if-cached` request
  // cannot be served by a worker, and answering it throws.
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

  event.respondWith(respond(event));
});
