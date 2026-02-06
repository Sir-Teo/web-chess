import test from "node:test";
import assert from "node:assert/strict";

import {
  formatScore,
  parseBestmove,
  parseInfo,
  parseUciOption,
  scoreToPercent,
} from "../src/uci.js";

test("parseUciOption parses spin options", () => {
  const line = "option name Hash type spin default 16 min 1 max 33554432";
  const option = parseUciOption(line);
  assert.ok(option);
  assert.equal(option.name, "Hash");
  assert.equal(option.type, "spin");
  assert.equal(option.default, "16");
  assert.equal(option.min, 1);
  assert.equal(option.max, 33554432);
});

test("parseUciOption parses combo vars", () => {
  const line = "option name Style type combo default Normal var Solid var Normal var Risky";
  const option = parseUciOption(line);
  assert.ok(option);
  assert.equal(option.name, "Style");
  assert.equal(option.type, "combo");
  assert.equal(option.default, "Normal");
  assert.deepEqual(option.vars, ["Solid", "Normal", "Risky"]);
});

test("parseInfo parses score, bound, and pv", () => {
  const line = "info depth 22 seldepth 34 nodes 123456 nps 1000000 time 250 score cp 31 lowerbound pv e2e4 e7e5";
  const info = parseInfo(line);
  assert.equal(info.depth, 22);
  assert.equal(info.seldepth, 34);
  assert.equal(info.nodes, 123456);
  assert.equal(info.nps, 1000000);
  assert.equal(info.time, 250);
  assert.deepEqual(info.score, { type: "cp", value: 31, bound: "lowerbound" });
  assert.equal(info.pv, "e2e4 e7e5");
});

test("parseBestmove parses bestmove and ponder", () => {
  assert.deepEqual(parseBestmove("bestmove e2e4 ponder e7e5"), {
    bestmove: "e2e4",
    ponder: "e7e5",
  });
  assert.deepEqual(parseBestmove("bestmove (none)"), {
    bestmove: "(none)",
    ponder: undefined,
  });
});

test("formatScore and scoreToPercent format cp and mate values", () => {
  assert.equal(formatScore({ type: "cp", value: 45 }), "+0.45");
  assert.equal(formatScore({ type: "cp", value: -112 }), "-1.12");
  assert.equal(formatScore({ type: "mate", value: 3 }), "Mate 3");
  assert.equal(scoreToPercent({ type: "mate", value: 2 }), 95);
  assert.equal(scoreToPercent({ type: "mate", value: -2 }), 5);
  assert.equal(scoreToPercent(null), 50);
});
