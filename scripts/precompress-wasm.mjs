#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";

const args = new Set(process.argv.slice(2));
const force = args.has("--force");
const root = process.cwd();
const stockfishDir = path.join(root, "vendor", "stockfish");

async function statOrNull(filePath) {
  try {
    return await fs.stat(filePath);
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = -1;
  while (value >= 1024 && unitIndex + 1 < units.length) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

function shouldWrite(sourceStats, targetStats, isForce) {
  if (isForce) return true;
  if (!targetStats) return true;
  return sourceStats.mtimeMs > targetStats.mtimeMs;
}

async function precompressFile(filePath) {
  const sourceStats = await fs.stat(filePath);
  const source = await fs.readFile(filePath);
  const targets = [
    {
      ext: ".br",
      compress: () =>
        brotliCompressSync(source, {
          params: {
            [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_GENERIC,
            [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
            [zlibConstants.BROTLI_PARAM_SIZE_HINT]: source.length,
          },
        }),
    },
    {
      ext: ".gz",
      compress: () => gzipSync(source, { level: zlibConstants.Z_BEST_COMPRESSION }),
    },
  ];

  let writtenAny = false;
  for (const target of targets) {
    const outPath = `${filePath}${target.ext}`;
    const outStats = await statOrNull(outPath);
    if (!shouldWrite(sourceStats, outStats, force)) {
      continue;
    }
    const compressed = target.compress();
    await fs.writeFile(outPath, compressed);
    await fs.utimes(outPath, sourceStats.atime, sourceStats.mtime);
    const ratio = source.length > 0 ? ((1 - compressed.length / source.length) * 100).toFixed(1) : "0.0";
    console.log(
      `${path.basename(outPath)}  ${formatBytes(source.length)} -> ${formatBytes(compressed.length)}  (${ratio}% smaller)`
    );
    writtenAny = true;
  }
  return writtenAny;
}

async function main() {
  const entries = await fs.readdir(stockfishDir, { withFileTypes: true });
  const wasmFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".wasm"))
    .map((entry) => path.join(stockfishDir, entry.name))
    .sort();

  if (!wasmFiles.length) {
    console.log("No .wasm files found in vendor/stockfish.");
    return;
  }

  let updated = 0;
  for (const filePath of wasmFiles) {
    const changed = await precompressFile(filePath);
    if (changed) updated += 1;
  }

  if (!updated) {
    console.log("Precompressed sidecars are already up to date.");
  } else {
    console.log(`Updated sidecars for ${updated} wasm file${updated === 1 ? "" : "s"}.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
