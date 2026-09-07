// Local HTTP server behind the raster render page. It serves the pinned
// provincial archive with Range support, the self-hosted glyphs and sprite,
// MapLibre and pmtiles from node_modules, the generated style JSON, and a polite
// disk-caching proxy for the OpenFreeMap supplemental source so the three styles
// and any rerun share one upstream fetch per tile.

import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

export const USER_AGENT = 'NSMarksTheSpot-atlas-raster (+https://kinnokilabs.com/apps/nsmarksthespot/)';
export const MAX_UPSTREAM_IN_FLIGHT = 8;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.pbf': 'application/x-protobuf',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
};

const VENDOR_MAPLIBRE = /^maplibre-gl(?:-shared|-worker)?\.(?:css|mjs|mjs\.map)$/;

export function contentType(file) {
  return MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}

/** Resolve `relative` under `base`, refusing anything that escapes it. */
export function safeJoin(base, relative) {
  const resolved = path.resolve(base, relative);
  const root = path.resolve(base);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': Buffer.byteLength(text) });
  res.end(text);
}

async function sendFile(req, res, file, extraHeaders = {}) {
  let info;
  try {
    info = await stat(file);
  } catch {
    return false;
  }
  if (!info.isFile()) return false;
  res.writeHead(200, { 'Content-Type': contentType(file), 'Content-Length': info.size, 'Cache-Control': 'no-cache', ...extraHeaders });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).pipe(res);
  return true;
}

function parseRange(header, size) {
  const match = /^bytes=(\d+)-(\d*)$/.exec(header ?? '');
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return null;
  return { start, end };
}

/** Bounded, deduplicated upstream fetches with retries on transient failures. */
class UpstreamQueue {
  constructor(limit) {
    this.limit = limit;
    this.active = 0;
    this.waiting = [];
  }

  async run(task) {
    if (this.active >= this.limit) await new Promise((resolve) => this.waiting.push(resolve));
    this.active++;
    try {
      return await task();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
}

/** Network failures, 429 and 5xx are retried with backoff; other statuses are final. */
async function fetchWithRetry(url, { attempts = 4, baseDelayMs = 1000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)));
    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/x-protobuf, application/json, */*' } });
      if (response.status === 204 || response.status === 404) return { empty: true, status: response.status };
      if (response.ok) return { bytes: Buffer.from(await response.arrayBuffer()), status: response.status };
      lastError = new Error(`${url}: HTTP ${response.status}`);
      if (response.status < 500 && response.status !== 429) throw lastError;
    } catch (error) {
      if (error === lastError) throw error;
      lastError = error;
    }
  }
  throw lastError ?? new Error(`${url}: fetch failed`);
}

const gunzipIfNeeded = (bytes) => (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes);

async function writeAtomic(file, bytes) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(temp, bytes);
  await rename(temp, file);
}

export async function startRenderServer({
  host = '127.0.0.1', port, webRoot, pageDir, archivePath, archiveName, archiveEtag, upstreamTileJson,
  osmCache, outputDir = null, reviewDir = null, maxUpstream = MAX_UPSTREAM_IN_FLIGHT, log = () => {},
}) {
  const origin = `http://${host}:${port}`;
  const styles = new Map();
  const stats = { upstreamTileJsonFetchedAt: null, upstreamTiles: null, tilesFetched: 0, tilesCached: 0, tilesEmpty: 0, upstreamFailures: 0, notFound: [] };
  const queue = new UpstreamQueue(maxUpstream);
  const inFlight = new Map();
  const archiveInfo = await stat(archivePath);
  let tileJsonPromise = null;

  const tileJson = () => {
    tileJsonPromise ??= (async () => {
      const file = path.join(osmCache, 'planet.json');
      let record;
      try {
        record = JSON.parse(await readFile(file, 'utf8'));
        if (record.url !== upstreamTileJson || !record.tilejson?.tiles?.[0]) throw new Error('stale');
      } catch {
        const result = await fetchWithRetry(upstreamTileJson);
        if (result.empty) throw new Error(`${upstreamTileJson}: HTTP ${result.status}`);
        record = { url: upstreamTileJson, fetchedAt: new Date().toISOString(), tilejson: JSON.parse(result.bytes.toString('utf8')) };
        if (!record.tilejson?.tiles?.[0]) throw new Error(`${upstreamTileJson}: TileJSON has no tiles template`);
        await writeAtomic(file, JSON.stringify(record, null, 2));
      }
      stats.upstreamTileJsonFetchedAt = record.fetchedAt;
      stats.upstreamTiles = record.tilejson.tiles[0];
      return record;
    })();
    return tileJsonPromise;
  };

  const osmTile = async (z, x, y) => {
    const file = path.join(osmCache, String(z), String(x), `${y}.pbf`);
    try {
      const bytes = await readFile(file);
      stats.tilesCached++;
      return bytes;
    } catch { /* fetch below */ }
    const key = `${z}/${x}/${y}`;
    let pending = inFlight.get(key);
    if (!pending) {
      pending = queue.run(async () => {
        const { tilejson } = await tileJson();
        const url = tilejson.tiles[0].replace('{z}', z).replace('{x}', x).replace('{y}', y);
        const result = await fetchWithRetry(url);
        const bytes = result.empty ? Buffer.alloc(0) : gunzipIfNeeded(result.bytes);
        await writeAtomic(file, bytes);
        stats.tilesFetched++;
        return bytes;
      }).finally(() => inFlight.delete(key));
      inFlight.set(key, pending);
    }
    return pending;
  };

  const handle = async (req, res) => {
    const url = new URL(req.url, origin);
    const pathname = decodeURIComponent(url.pathname);
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'POST') return sendText(res, 405, 'Method not allowed');
    let match;

    if (pathname === '/render.html') {
      if (await sendFile(req, res, path.join(pageDir, 'render.html'))) return;
    } else if ((match = /^\/vendor\/maplibre-gl\/([^/]+)$/.exec(pathname)) && VENDOR_MAPLIBRE.test(match[1])) {
      if (await sendFile(req, res, path.join(webRoot, 'node_modules/maplibre-gl/dist', match[1]))) return;
    } else if (pathname === '/vendor/pmtiles/pmtiles.js') {
      if (await sendFile(req, res, path.join(webRoot, 'node_modules/pmtiles/dist/pmtiles.js'))) return;
    } else if ((match = /^\/atlas\/(fonts|sprite)\/(.+)$/.exec(pathname))) {
      const file = safeJoin(path.join(webRoot, 'public/atlas', match[1]), match[2]);
      if (file && await sendFile(req, res, file)) return;
    } else if ((match = /^\/styles\/([a-z]+)\.json$/.exec(pathname)) && styles.has(match[1])) {
      const body = styles.get(match[1]);
      res.writeHead(200, { 'Content-Type': MIME['.json'], 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-cache' });
      return res.end(req.method === 'HEAD' ? undefined : body);
    } else if (pathname === `/archive/${archiveName}`) {
      const size = archiveInfo.size;
      const headers = { 'Content-Type': 'application/octet-stream', 'Accept-Ranges': 'bytes', ETag: `"${archiveEtag}"`, 'Cache-Control': 'no-cache' };
      const range = req.headers.range ? parseRange(req.headers.range, size) : null;
      if (req.headers.range && !range) {
        res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` });
        return res.end();
      }
      if (range) {
        res.writeHead(206, { ...headers, 'Content-Range': `bytes ${range.start}-${range.end}/${size}`, 'Content-Length': range.end - range.start + 1 });
        if (req.method === 'HEAD') return res.end();
        return createReadStream(archivePath, { start: range.start, end: range.end }).pipe(res);
      }
      res.writeHead(200, { ...headers, 'Content-Length': size });
      if (req.method === 'HEAD') return res.end();
      return createReadStream(archivePath).pipe(res);
    } else if (pathname === '/osm/planet.json') {
      try {
        const { tilejson } = await tileJson();
        const body = JSON.stringify({ ...tilejson, tiles: [`${origin}/osm/tiles/{z}/{x}/{y}.pbf`] });
        res.writeHead(200, { 'Content-Type': MIME['.json'], 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-cache' });
        return res.end(req.method === 'HEAD' ? undefined : body);
      } catch (error) {
        stats.upstreamFailures++;
        log(`upstream TileJSON failed: ${error.message}`);
        return sendText(res, 502, `OpenFreeMap TileJSON unavailable: ${error.message}`);
      }
    } else if ((match = /^\/osm\/tiles\/(\d{1,2})\/(\d{1,7})\/(\d{1,7})\.pbf$/.exec(pathname))) {
      try {
        const bytes = await osmTile(Number(match[1]), Number(match[2]), Number(match[3]));
        if (bytes.length === 0) {
          stats.tilesEmpty++;
          res.writeHead(204, { 'Cache-Control': 'no-cache' });
          return res.end();
        }
        res.writeHead(200, { 'Content-Type': MIME['.pbf'], 'Content-Length': bytes.length, 'Cache-Control': 'no-cache' });
        return res.end(req.method === 'HEAD' ? undefined : bytes);
      } catch (error) {
        stats.upstreamFailures++;
        log(`upstream tile ${match[1]}/${match[2]}/${match[3]} failed: ${error.message}`);
        return sendText(res, 502, `OpenFreeMap tile unavailable: ${error.message}`);
      }
    } else if (outputDir && (match = /^\/out\/(.+)$/.exec(pathname))) {
      const file = safeJoin(outputDir, match[1]);
      if (file && await sendFile(req, res, file)) return;
    } else if (reviewDir && req.method === 'POST' && (match = /^\/review\/([\w.-]+\.png)$/.exec(pathname))) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      await writeAtomic(path.join(reviewDir, match[1]), Buffer.concat(chunks));
      return sendText(res, 201, 'stored');
    }
    stats.notFound.push(pathname);
    log(`404 ${pathname}`);
    sendText(res, 404, `Not found: ${pathname}`);
  };

  const server = createServer((req, res) => {
    handle(req, res).catch((error) => {
      log(`request ${req.url} failed: ${error.stack ?? error}`);
      if (!res.headersSent) sendText(res, 500, String(error.message ?? error));
      else res.destroy();
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => { server.off('error', reject); resolve(); });
  });

  return {
    origin,
    stats,
    setStyle: (mode, json) => styles.set(mode, json),
    warmTileJson: tileJson,
    close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}
