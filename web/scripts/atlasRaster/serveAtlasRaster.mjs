#!/usr/bin/env node
// Serve a rendered Atlas raster output directory over plain HTTP with the
// production path prefix, so a simulator or browser can be pointed at
// http://127.0.0.1:<port>/atlas-raster/<revision>/<style>/{z}/{x}/{y}.webp
// before anything is published.
//
//   node scripts/atlasRaster/serveAtlasRaster.mjs --dir <out> [--port 4791] [--host 127.0.0.1]

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { contentType, safeJoin } from './renderServer.mjs';

export const PATH_PREFIX = '/atlas-raster/';

function parseArgs(argv) {
  const options = { dir: null, port: 4791, host: '127.0.0.1' };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    const value = () => {
      const next = argv[++index];
      if (next === undefined) throw new Error(`${flag} needs a value.`);
      return next;
    };
    switch (flag) {
      case '--dir': options.dir = path.resolve(value()); break;
      case '--port': options.port = Number(value()); break;
      case '--host': options.host = value(); break;
      case '--help': case '-h':
        console.log('Usage: node scripts/atlasRaster/serveAtlasRaster.mjs --dir <out> [--port 4791] [--host 127.0.0.1]');
        process.exit(0);
        break;
      default: throw new Error(`Unknown option ${flag}.`);
    }
  }
  if (!options.dir) throw new Error('--dir <output directory holding <revision>/…> is required.');
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) throw new Error('--port must be a TCP port number.');
  return options;
}

/** Map a request path to a file under the output directory, or null. */
export function resolveTilePath(dir, pathname) {
  if (!pathname.startsWith(PATH_PREFIX)) return null;
  const relative = decodeURIComponent(pathname.slice(PATH_PREFIX.length));
  if (!/^[\w.-]+\/(?:source\.json|coverage\.json|(?:day|night|fletcher)\/(?:ocean\/\d{1,2}\.webp|\d{1,2}\/\d{1,7}\/\d{1,7}\.webp))$/.test(relative)) return null;
  return safeJoin(dir, relative);
}

export function startTileServer({ dir, port, host, log = () => {} }) {
  const server = createServer(async (req, res) => {
    const file = req.method === 'GET' || req.method === 'HEAD' ? resolveTilePath(dir, new URL(req.url, 'http://localhost').pathname) : null;
    let info = null;
    if (file) {
      try {
        info = await stat(file);
      } catch { /* 404 below */ }
    }
    if (!info?.isFile()) {
      log(`404 ${req.method} ${req.url}`);
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': contentType(file), 'Content-Length': info.size, 'Cache-Control': 'public, max-age=60', 'Access-Control-Allow-Origin': '*' });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve({ server, origin: `http://${host}:${server.address().port}`, close: () => new Promise((done) => server.close(done)) });
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const options = parseArgs(process.argv.slice(2));
  const log = (message) => console.error(`[atlas-raster-serve] ${message}`);
  startTileServer({ ...options, log }).then(({ origin }) => {
    log(`Serving ${options.dir} at ${origin}${PATH_PREFIX}<revision>/… (Ctrl-C to stop)`);
  }).catch((error) => {
    log(`FAILED: ${error.message}`);
    process.exit(1);
  });
}
