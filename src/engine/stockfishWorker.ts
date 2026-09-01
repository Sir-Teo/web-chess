import {
  deriveWasmPath,
  toAbsoluteAssetUrl,
  type EngineProfile,
} from './profiles'

export type StockfishWorkerHandle = {
  worker: Worker
  blobUrl?: string
}

function createBootstrapSource(workerPath: string, threaded: boolean): string {
  const scriptUrl = toAbsoluteAssetUrl(workerPath)
  const wasmUrl = toAbsoluteAssetUrl(deriveWasmPath(workerPath))
  const pthreadProxy = threaded
    ? `
var StockfishNativeWorker = self.Worker;
var StockfishPthreadWorkerUrl = URL.createObjectURL(new Blob([\`
self.window = self;
self.addEventListener('error', function (event) {
  try {
    self.postMessage('__BOOT_ERROR__:' + (event && event.message ? event.message : 'Unknown pthread bootstrap error'));
  } catch (_) {}
  event.preventDefault();
});
try {
  importScripts(${JSON.stringify(scriptUrl)});
} catch (error) {
  self.postMessage('__BOOT_ERROR__:' + (error && error.message ? error.message : String(error)));
}
\`], { type: 'application/javascript' }));
self.Worker = function (url, options) {
  if (String(url).includes(',worker')) {
    return new StockfishNativeWorker(StockfishPthreadWorkerUrl + '#' + ${JSON.stringify(encodeURIComponent(wasmUrl))} + ',worker', options);
  }
  return new StockfishNativeWorker(url, options);
};
`
    : ''

  return `
self.window = self;
${pthreadProxy}
self.addEventListener('error', function (event) {
  try {
    self.postMessage('__BOOT_ERROR__:' + (event && event.message ? event.message : 'Unknown worker bootstrap error'));
  } catch (_) {}
  event.preventDefault();
});
self.addEventListener('unhandledrejection', function (event) {
  try {
    var reason = event && event.reason;
    self.postMessage('__BOOT_ERROR__:' + (reason && reason.message ? reason.message : String(reason)));
  } catch (_) {}
  event.preventDefault();
});
try {
  importScripts(${JSON.stringify(scriptUrl)});
} catch (error) {
  self.postMessage('__BOOT_ERROR__:' + (error && error.message ? error.message : String(error)));
}
`
}

/**
 * Boot a profile's worker through the bootstrap above.
 *
 * Every profile goes through it, and the one that used to be exempt is the
 * reason this comment exists. `needsBootstrap` returned true for the CDN
 * builds and for `lite-single-local`, and false for `lite-multi-local` -- the
 * single local build that spawns pthread workers, and so the only one that
 * needs the `self.Worker` proxy the bootstrap installs.
 *
 * What that cost: `new Worker(workerPath)` boots the multi-threaded build, the
 * build spawns its first pthread, that pthread has no `self.window` and no
 * wasm URL, and the parent answers `worker sent an error!` and dies. The hook
 * catches it, falls back to `lite-single-local`, and the fallback's reason is
 * then overwritten by the replacement's own profile message -- so on `auto`,
 * on a cross-origin-isolated desktop with sixteen cores, the app ran the
 * engine on one thread and said nothing at all.
 *
 * Measured in the browser it was found in: without the bootstrap the worker
 * reports `worker sent an error! undefined:undefined: undefined`; with it,
 * `id name Stockfish 18 Lite WASM Multithreaded` and a full `uciok`. The
 * repo's own thread table puts the difference at 7.8M nodes against 55.3M in
 * the same 2000ms.
 */
/**
 * The bootstrap a profile's worker is booted with. Exported so the rule above
 * -- every profile is wrapped, and a profile that spawns pthreads gets the
 * `self.Worker` proxy -- is checked rather than described.
 */
export function engineWorkerBootstrapSource(profile: EngineProfile): string {
  return createBootstrapSource(profile.workerPath, profile.requiresIsolation)
}

export function createStockfishWorker(profile: EngineProfile): StockfishWorkerHandle {
  const wasmPath = toAbsoluteAssetUrl(deriveWasmPath(profile.workerPath))
  const blobUrl = URL.createObjectURL(
    new Blob([engineWorkerBootstrapSource(profile)], { type: 'application/javascript' }),
  )

  try {
    return {
      worker: new Worker(`${blobUrl}#${encodeURIComponent(wasmPath)}`),
      blobUrl,
    }
  } catch (error) {
    URL.revokeObjectURL(blobUrl)
    throw error
  }
}
