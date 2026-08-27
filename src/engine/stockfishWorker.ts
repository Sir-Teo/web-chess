import {
  deriveWasmPath,
  toAbsoluteAssetUrl,
  type EngineProfile,
} from './profiles'

export type StockfishWorkerHandle = {
  worker: Worker
  blobUrl?: string
}

function needsBootstrap(profile: EngineProfile): boolean {
  return profile.source === 'cdn' || profile.id === 'lite-single-local'
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

export function createStockfishWorker(profile: EngineProfile): StockfishWorkerHandle {
  if (!needsBootstrap(profile)) {
    return { worker: new Worker(profile.workerPath) }
  }

  const wasmPath = toAbsoluteAssetUrl(deriveWasmPath(profile.workerPath))
  const blobUrl = URL.createObjectURL(
    new Blob([createBootstrapSource(profile.workerPath, profile.requiresIsolation)], { type: 'application/javascript' }),
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
