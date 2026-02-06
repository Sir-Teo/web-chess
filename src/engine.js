import { parseUciOption, parseInfo, parseBestmove } from "./uci.js";

const ENGINE_SPECS = {
  standard: {
    label: "Standard (multi-threaded)",
    js: "vendor/stockfish/stockfish-17.1-8e4d048.js",
    wasm: "vendor/stockfish/stockfish-17.1-8e4d048.wasm",
    threads: true,
    parts: 6,
  },
  "standard-single": {
    label: "Standard (single-threaded)",
    js: "vendor/stockfish/stockfish-17.1-single-a496a04.js",
    wasm: "vendor/stockfish/stockfish-17.1-single-a496a04.wasm",
    threads: false,
    parts: 6,
  },
  lite: {
    label: "Lite (multi-threaded)",
    js: "vendor/stockfish/stockfish-17.1-lite-51f59da.js",
    wasm: "vendor/stockfish/stockfish-17.1-lite-51f59da.wasm",
    threads: true,
    parts: 0,
  },
  "lite-single": {
    label: "Lite (single-threaded)",
    js: "vendor/stockfish/stockfish-17.1-lite-single-03e3232.js",
    wasm: "vendor/stockfish/stockfish-17.1-lite-single-03e3232.wasm",
    threads: false,
    parts: 0,
  },
  asm: {
    label: "ASM.js fallback",
    js: "vendor/stockfish/stockfish-17.1-asm-341ff22.js",
    wasm: null,
    threads: false,
    parts: 0,
  },
};

const THREADS_FALLBACK = {
  standard: "standard-single",
  lite: "lite-single",
};
const preloadPromises = new Map();

const resolveAssetUrl = (assetPath) => {
  if (typeof window !== "undefined" && window.location) {
    return new URL(assetPath, window.location.href);
  }
  return new URL(assetPath, import.meta.url);
};

function supportsWasm() {
  return typeof WebAssembly === "object" && typeof WebAssembly.instantiate === "function";
}

function getHardwareInfo() {
  if (typeof navigator === "undefined") {
    return { memory: null, cores: null };
  }
  const memory = typeof navigator.deviceMemory === "number" ? navigator.deviceMemory : null;
  const cores = typeof navigator.hardwareConcurrency === "number" ? navigator.hardwareConcurrency : null;
  return { memory, cores };
}

function getDeviceTier() {
  const { memory, cores } = getHardwareInfo();
  if (memory === null && cores === null) return "low";
  const lowMemory = memory !== null && memory <= 4;
  const lowCores = cores !== null && cores <= 4;
  if (lowMemory || lowCores) return "low";
  const midMemory = memory !== null && memory <= 8;
  const midCores = cores !== null && cores <= 8;
  if (midMemory || midCores) return "mid";
  return "high";
}

function isCrossOriginIsolated() {
  return typeof self !== "undefined" && self.crossOriginIsolated === true;
}

function canUseThreads() {
  return supportsWasm() && typeof SharedArrayBuffer !== "undefined" && isCrossOriginIsolated();
}

function pickAutoSpecKey() {
  if (!supportsWasm()) return "asm";
  const tier = getDeviceTier();
  const preferLite = tier === "low";
  if (canUseThreads()) {
    return preferLite ? "lite" : "standard";
  }
  return preferLite ? "lite-single" : "standard-single";
}

function resolveEngineSpecKey(key) {
  if (key === "auto") {
    return pickAutoSpecKey();
  }
  if (!ENGINE_SPECS[key]) {
    return supportsWasm() ? "standard-single" : "asm";
  }
  const spec = ENGINE_SPECS[key];
  if (spec.wasm && !supportsWasm()) return "asm";
  if (spec.threads && !canUseThreads()) {
    return THREADS_FALLBACK[key] || "standard-single";
  }
  return key;
}

export class EngineController {
  constructor() {
    this.worker = null;
    this.listeners = new Map();
    this.options = new Map();
    this.info = {};
    this.variant = null;
    this.supportsThreads = false;
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(handler);
  }

  emit(event, payload) {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    handlers.forEach((handler) => handler(payload));
  }

  resolveSpec(key) {
    const resolvedKey = resolveEngineSpecKey(key);
    return ENGINE_SPECS[resolvedKey] || ENGINE_SPECS["standard-single"];
  }

  async load(variantKey = "auto") {
    this.dispose();
    this.options.clear();
    this.info = {};

    const spec = this.resolveSpec(variantKey);
    this.variant = spec;
    this.supportsThreads = spec.threads && canUseThreads();

    const jsUrl = resolveAssetUrl(spec.js);
    let workerUrl = new URL(jsUrl);

    if (spec.wasm) {
      const wasmUrl = resolveAssetUrl(spec.wasm);
      workerUrl.hash = wasmUrl.toString();
    }

    const worker = new Worker(workerUrl);
    this.worker = worker;

    worker.onmessage = (event) => {
      const line = typeof event.data === "string" ? event.data : String(event.data);
      this.emit("line", line);
      this.handleLine(line);
    };

    worker.onerror = (err) => {
      this.emit("error", err);
      if (spec.threads && !canUseThreads()) {
        this.load("standard-single");
      }
    };

    // Queue UCI init
    this.send("uci");
  }

  dispose() {
    if (!this.worker) return;
    try {
      this.send("quit");
      this.worker.terminate();
    } catch (err) {
      // ignore
    }
    this.worker = null;
  }

  send(cmd) {
    if (!this.worker) return;
    this.worker.postMessage(cmd);
  }

  handleLine(line) {
    if (line.startsWith("id name")) {
      this.emit("id", { type: "name", value: line.replace("id name", "").trim() });
      return;
    }
    if (line.startsWith("id author")) {
      this.emit("id", { type: "author", value: line.replace("id author", "").trim() });
      return;
    }
    if (line.startsWith("option ")) {
      const option = parseUciOption(line);
      if (option) {
        this.options.set(option.name, option);
        this.emit("option", option);
      }
      return;
    }
    if (line === "uciok") {
      this.emit("uciok", true);
      return;
    }
    if (line === "readyok") {
      this.emit("readyok", true);
      return;
    }
    if (line.startsWith("info ")) {
      const info = parseInfo(line);
      if (info) {
        this.info = { ...this.info, ...info };
        this.emit("info", info);
      }
      return;
    }
    if (line.startsWith("bestmove")) {
      const move = parseBestmove(line);
      if (move) {
        this.emit("bestmove", move);
      }
      return;
    }
    if (line.startsWith("info string")) {
      this.emit("infoString", line.replace("info string", "").trim());
      return;
    }
    this.emit("misc", line);
  }
}

export function getEngineSpecs() {
  return ENGINE_SPECS;
}

export function threadsAvailable() {
  return canUseThreads();
}

function collectSpecAssetUrls(spec) {
  const urls = [spec.js];
  if (spec.wasm) {
    if (spec.parts && spec.parts > 0) {
      const base = spec.wasm.replace(/\.wasm$/i, "");
      for (let i = 0; i < spec.parts; i += 1) {
        urls.push(`${base}-part-${i}.wasm`);
      }
    } else {
      urls.push(spec.wasm);
    }
  }
  return urls;
}

export function preloadEngineAssets(variantKey = "auto", options = {}) {
  const resolvedKey = resolveEngineSpecKey(variantKey);
  if (preloadPromises.has(resolvedKey)) {
    return preloadPromises.get(resolvedKey);
  }
  const spec = ENGINE_SPECS[resolvedKey] || ENGINE_SPECS["standard-single"];
  const urls = collectSpecAssetUrls(spec);
  const fetchOptions = options.background
    ? { credentials: "same-origin", cache: "force-cache", priority: "low" }
    : { credentials: "same-origin", cache: "default" };
  const preloadPromise = Promise.all(
    urls.map((url) => fetch(resolveAssetUrl(url), fetchOptions).catch(() => null))
  );
  preloadPromises.set(resolvedKey, preloadPromise);
  return preloadPromise;
}

export function queueEngineAssetPreload(variantKey = "auto") {
  const schedule = typeof self !== "undefined" && typeof self.requestIdleCallback === "function"
    ? self.requestIdleCallback.bind(self)
    : (callback) => setTimeout(callback, 0);
  schedule(() => {
    preloadEngineAssets(variantKey, { background: true }).catch(() => {});
  });
}
