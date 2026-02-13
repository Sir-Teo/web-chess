import test from "node:test";
import assert from "node:assert/strict";

import {
  __resetPreloadCacheForTests,
  EngineController,
  getEngineSpecs,
  queueEngineAssetPreload,
  threadsAvailable,
} from "../src/engine.js";

function withMockNavigator(mock, run) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    writable: true,
    value: mock,
  });
  return Promise.resolve()
    .then(run)
    .finally(() => {
      if (original) {
        Object.defineProperty(globalThis, "navigator", original);
      } else {
        delete globalThis.navigator;
      }
    });
}

test("getEngineSpecs exposes expected variants", () => {
  const specs = getEngineSpecs();
  assert.ok(specs.standard);
  assert.ok(specs["standard-single"]);
  assert.ok(specs.lite);
  assert.ok(specs["lite-single"]);
  assert.ok(specs.asm);
});

test("threadsAvailable returns a boolean", () => {
  assert.equal(typeof threadsAvailable(), "boolean");
});

test("EngineController.resolveSpec falls back for unknown keys", () => {
  const controller = new EngineController();
  const spec = controller.resolveSpec("__unknown__");
  assert.ok(spec);
  assert.equal(typeof spec.label, "string");
});

test("EngineController.send is a no-op without a worker", () => {
  const controller = new EngineController();
  assert.doesNotThrow(() => controller.send("uci"));
});

test("EngineController.dispose sends quit and terminates worker", () => {
  const sent = [];
  let terminated = false;
  const controller = new EngineController();
  controller.worker = {
    postMessage(cmd) {
      sent.push(cmd);
    },
    terminate() {
      terminated = true;
    },
  };

  controller.dispose();
  assert.deepEqual(sent, ["quit"]);
  assert.equal(terminated, true);
  assert.equal(controller.worker, null);
});

test("EngineController.handleLine emits parsed UCI events", () => {
  const controller = new EngineController();
  const events = [];
  controller.on("id", (payload) => events.push(["id", payload]));
  controller.on("option", (payload) => events.push(["option", payload]));
  controller.on("uciok", (payload) => events.push(["uciok", payload]));
  controller.on("readyok", (payload) => events.push(["readyok", payload]));
  controller.on("info", (payload) => events.push(["info", payload]));
  controller.on("infoString", (payload) => events.push(["infoString", payload]));
  controller.on("bestmove", (payload) => events.push(["bestmove", payload]));
  controller.on("misc", (payload) => events.push(["misc", payload]));

  controller.handleLine("id name Stockfish 17.1");
  controller.handleLine("option name Hash type spin default 16 min 1 max 1024");
  controller.handleLine("uciok");
  controller.handleLine("readyok");
  controller.handleLine("info string benchmark");
  controller.handleLine("info depth 10 score cp 20 pv e2e4 e7e5");
  controller.handleLine("bestmove e2e4 ponder e7e5");
  controller.handleLine("unknown output line");

  assert.deepEqual(events[0], ["id", { type: "name", value: "Stockfish 17.1" }]);
  assert.equal(events[1][0], "option");
  assert.equal(events[1][1].name, "Hash");
  assert.deepEqual(events[2], ["uciok", true]);
  assert.deepEqual(events[3], ["readyok", true]);
  assert.deepEqual(events[4], ["infoString", "benchmark"]);
  assert.equal(events[5][0], "info");
  assert.equal(events[5][1].depth, 10);
  assert.equal(events[5][1].pv, "e2e4 e7e5");
  assert.deepEqual(events[6], ["bestmove", { bestmove: "e2e4", ponder: "e7e5" }]);
  assert.deepEqual(events[7], ["misc", "unknown output line"]);
});

test("EngineController throttles redundant info lines while preserving depth jumps", () => {
  const controller = new EngineController();
  const depths = [];
  controller.on("info", (payload) => depths.push(payload.depth));
  controller.setInfoThrottle(10000);

  controller.handleLine("info depth 8 score cp 14 pv e2e4 e7e5");
  controller.handleLine("info depth 8 score cp 20 pv e2e4 e7e5");
  controller.handleLine("info depth 9 score cp 25 pv e2e4 e7e5");

  assert.deepEqual(depths, [8, 9]);

  controller.resetInfoThrottle();
  controller.handleLine("info depth 8 score cp 13 pv e2e4 e7e5");
  assert.deepEqual(depths, [8, 9, 8]);
});

test("queueEngineAssetPreload skips heavy split wasm variants by default", async () => {
  __resetPreloadCacheForTests();
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response("");
  };
  try {
    queueEngineAssetPreload("standard-single");
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(fetchCalls, 0);
  } finally {
    __resetPreloadCacheForTests();
    globalThis.fetch = originalFetch;
  }
});

test("queueEngineAssetPreload preloads heavy split wasm on capable devices", async () => {
  __resetPreloadCacheForTests();
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response("");
  };
  const originalWindow = globalThis.window;
  globalThis.window = {};
  try {
    await withMockNavigator(
      {
        deviceMemory: 8,
        hardwareConcurrency: 8,
        connection: { saveData: false, effectiveType: "4g" },
      },
      async () => {
        queueEngineAssetPreload("standard-single");
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    );
    assert.ok(fetchCalls > 0);
  } finally {
    __resetPreloadCacheForTests();
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test("queueEngineAssetPreload can force heavy split wasm preload", async () => {
  __resetPreloadCacheForTests();
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response("");
  };
  try {
    queueEngineAssetPreload("standard-single", { force: true });
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.ok(fetchCalls > 0);
  } finally {
    __resetPreloadCacheForTests();
    globalThis.fetch = originalFetch;
  }
});
