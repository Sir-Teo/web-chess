#!/usr/bin/env node

const http = require("http");
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const port = Number(process.env.PORT || process.argv[2] || 4173);

const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".json": "application/json",
};

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const safePath = path.normalize(urlPath).replace(/^\.\.(?=\/|$)/, "");
  let filePath = path.join(root, safePath);

  if (safePath === "/") {
    filePath = path.join(root, "index.html");
  }

  fs.stat(filePath, (err, stats) => {
    if (err) {
      return send(res, 404, { "Content-Type": "text/plain" }, "Not Found");
    }

    if (stats.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        return send(res, 500, { "Content-Type": "text/plain" }, "Error");
      }

      const ext = path.extname(filePath).toLowerCase();
      const cacheControl = safePath.startsWith("/vendor/stockfish/")
        ? "public, max-age=31536000, immutable"
        : "no-cache";
      const headers = {
        "Content-Type": mime[ext] || "application/octet-stream",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Cache-Control": cacheControl,
      };
      send(res, 200, headers, data);
    });
  });
});

server.listen(port, () => {
  console.log(`Vulcan server running at http://localhost:${port}`);
  console.log("COOP/COEP headers enabled for multi-threaded Stockfish.");
});
