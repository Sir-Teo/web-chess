#!/usr/bin/env node

const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const zlib = require("zlib");

const root = process.cwd();
const rootResolved = path.resolve(root);
const port = Number(process.env.PORT || process.argv[2] || 4173);

const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".json": "application/json",
};
const compressibleExt = new Set([".html", ".js", ".mjs", ".css", ".json", ".svg", ".txt"]);

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

function sanitizePathname(pathname) {
  const normalized = path.posix.normalize(pathname || "/");
  const absolutePath = path.resolve(rootResolved, `.${normalized}`);
  if (absolutePath === rootResolved) return absolutePath;
  if (!absolutePath.startsWith(`${rootResolved}${path.sep}`)) return null;
  return absolutePath;
}

function createEtag(stats) {
  return `W/"${stats.size.toString(16)}-${Math.floor(stats.mtimeMs).toString(16)}"`;
}

function isFresh(req, etag, mtimeMs) {
  const ifNoneMatch = req.headers["if-none-match"];
  if (ifNoneMatch) {
    const tags = String(ifNoneMatch).split(",").map((entry) => entry.trim());
    if (tags.includes(etag) || tags.includes("*")) return true;
  }
  const ifModifiedSince = req.headers["if-modified-since"];
  if (ifModifiedSince) {
    const since = Date.parse(ifModifiedSince);
    if (Number.isFinite(since) && Math.floor(mtimeMs) <= since) {
      return true;
    }
  }
  return false;
}

function parseRange(rangeHeader, size) {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader).trim());
  if (!match) return { invalid: true };
  const startRaw = match[1];
  const endRaw = match[2];
  if (!startRaw && !endRaw) return { invalid: true };
  let start;
  let end;
  if (!startRaw) {
    const suffixLength = Number(endRaw);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return { invalid: true };
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(startRaw);
    end = endRaw ? Number(endRaw) : size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { invalid: true };
  if (start < 0 || end < start || start >= size) return { invalid: true };
  return { start, end: Math.min(end, size - 1) };
}

function pickCompression(req, ext, size) {
  if (req.method !== "GET") return null;
  if (size < 1024) return null;
  if (!compressibleExt.has(ext)) return null;
  const accepted = String(req.headers["accept-encoding"] || "");
  if (accepted.includes("br")) return "br";
  if (accepted.includes("gzip")) return "gzip";
  return null;
}

function buildBaseHeaders(ext, cacheControl, stats) {
  return {
    "Content-Type": mime[ext] || "application/octet-stream",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cache-Control": cacheControl,
    ETag: createEtag(stats),
    "Last-Modified": stats.mtime.toUTCString(),
    "Accept-Ranges": "bytes",
  };
}

function streamResponse(res, filePath, range, compression) {
  const stream = range
    ? fs.createReadStream(filePath, { start: range.start, end: range.end })
    : fs.createReadStream(filePath);

  stream.on("error", () => {
    if (!res.headersSent) {
      send(res, 500, { "Content-Type": "text/plain" }, "Error");
      return;
    }
    res.destroy();
  });

  if (compression === "br") {
    stream.pipe(zlib.createBrotliCompress()).pipe(res);
    return;
  }
  if (compression === "gzip") {
    stream.pipe(zlib.createGzip()).pipe(res);
    return;
  }
  stream.pipe(res);
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, { "Content-Type": "text/plain", Allow: "GET, HEAD" }, "Method Not Allowed");
    return;
  }

  const rawUrl = typeof req.url === "string" ? req.url : "/";
  let pathname;
  try {
    pathname = decodeURIComponent(rawUrl.split("?")[0] || "/");
  } catch (err) {
    send(res, 400, { "Content-Type": "text/plain" }, "Bad Request");
    return;
  }

  const sanitized = sanitizePathname(pathname);
  if (!sanitized) {
    send(res, 403, { "Content-Type": "text/plain" }, "Forbidden");
    return;
  }

  let filePath = sanitized;
  let stats;
  try {
    stats = await fsp.stat(filePath);
    if (stats.isDirectory()) {
      filePath = path.join(filePath, "index.html");
      stats = await fsp.stat(filePath);
    }
  } catch (err) {
    if (err && err.code === "ENOENT") {
      send(res, 404, { "Content-Type": "text/plain" }, "Not Found");
      return;
    }
    send(res, 500, { "Content-Type": "text/plain" }, "Error");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const cacheControl = pathname.startsWith("/vendor/stockfish/")
    ? "public, max-age=31536000, immutable"
    : "no-cache";
  const headers = buildBaseHeaders(ext, cacheControl, stats);
  const etag = headers.ETag;

  if (!req.headers.range && isFresh(req, etag, stats.mtimeMs)) {
    res.writeHead(304, headers);
    res.end();
    return;
  }

  const range = parseRange(req.headers.range, stats.size);
  if (range && range.invalid) {
    res.writeHead(416, {
      ...headers,
      "Content-Range": `bytes */${stats.size}`,
    });
    res.end();
    return;
  }

  const isRanged = Boolean(range);
  const compression = isRanged ? null : pickCompression(req, ext, stats.size);
  const status = isRanged ? 206 : 200;
  const responseHeaders = { ...headers, Vary: "Accept-Encoding" };

  if (isRanged) {
    const length = range.end - range.start + 1;
    responseHeaders["Content-Range"] = `bytes ${range.start}-${range.end}/${stats.size}`;
    responseHeaders["Content-Length"] = String(length);
  } else if (compression) {
    responseHeaders["Content-Encoding"] = compression;
  } else {
    responseHeaders["Content-Length"] = String(stats.size);
  }

  res.writeHead(status, responseHeaders);
  if (req.method === "HEAD") {
    res.end();
    return;
  }

  streamResponse(res, filePath, range, compression);
});

server.listen(port, () => {
  console.log(`Vulcan server running at http://localhost:${port}`);
  console.log("COOP/COEP headers enabled for multi-threaded Stockfish.");
});
