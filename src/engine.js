import { parseUciOption, parseInfo, parseBestmove } from "./uci.js";

const ENGINE_SPECS = {
  standard: {
    label: "Standard (multi-threaded)",
    js: "../vendor/stockfish/stockfish-17.1-8e4d048.js",
    wasm: "../vendor/stockfish/stockfish-17.1-8e4d048.wasm",
    threads: true,
    parts: 6,
  },
  "standard-single": {
    label: "Standard (single-threaded)",
    js: "../vendor/stockfish/stockfish-17.1-single-a496a04.js",
    wasm: "../vendor/stockfish/stockfish-17.1-single-a496a04.wasm",
    threads: false,
    parts: 6,
  },
  lite: {
    label: "Lite (multi-threaded)",
    js: "../vendor/stockfish/stockfish-17.1-lite-51f59da.js",
    wasm: "../vendor/stockfish/stockfish-17.1-lite-51f59da.wasm",
    threads: true,
    parts: 0,
  },
  "lite-single": {
    label: "Lite (single-threaded)",
    js: "../vendor/stockfish/stockfish-17.1-lite-single-03e3232.js",
    wasm: "../vendor/stockfish/stockfish-17.1-lite-single-03e3232.wasm",
    threads: false,
    parts: 0,
  },
  asm: {
    label: "ASM.js fallback",
    js: "../vendor/stockfish/stockfish-17.1-asm-341ff22.js",
    wasm: null,
    threads: false,
    parts: 0,
  },
};

function canUseThreads() {
  return typeof SharedArrayBuffer !== "undefined" && self.crossOriginIsolated === true;
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
    if (key === "auto") {
      if (canUseThreads()) {
        return ENGINE_SPECS.standard;
      }
      return ENGINE_SPECS["standard-single"];
    }
    return ENGINE_SPECS[key] || ENGINE_SPECS["standard-single"];
  }

  async load(variantKey = "auto") {
    this.dispose();
    this.options.clear();
    this.info = {};

    const spec = this.resolveSpec(variantKey);
    this.variant = spec;
    this.supportsThreads = spec.threads && canUseThreads();

    const jsUrl = new URL(spec.js, import.meta.url);
    let workerUrl = new URL(jsUrl);

    if (spec.wasm) {
      const wasmUrl = new URL(spec.wasm, import.meta.url);
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

export function preloadEngineAssets(variantKey = "auto") {
  const spec = ENGINE_SPECS[variantKey] || ENGINE_SPECS["standard-single"];
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
  return Promise.all(
    urls.map((url) => fetch(new URL(url, import.meta.url)).catch(() => null))
  );
}
