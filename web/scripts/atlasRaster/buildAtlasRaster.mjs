#!/usr/bin/env node
// Render the NS Marks Atlas basemap (Day, Night, Fletcher) to raster tiles so a
// client without a vector renderer (the native app's MapKit) can show the same
// cartography. The web style is bundled from src/atlas/style.ts and drawn by
// the same maplibre-gl build in headless Chromium; nothing is re-implemented.
//
// Package contract (an immutable revision, published separately):
//   <out>/<revision>/source.json                 receipt
//   <out>/<revision>/coverage.json               rendered addresses per zoom
//   <out>/<revision>/<style>/{z}/{x}/{y}.webp    style = day | night | fletcher
//   <out>/<revision>/<style>/ocean/{z}.webp      stand-in outside coverage
//
// Tile (z, x, y) is the standard XYZ Web Mercator extent rendered at MapLibre
// zoom z (512 CSS px per tile) at pixelRatio 2, so every image is 1024 px.
// A tile is rendered iff the provincial archive holds a tile at that address.
//
//   node scripts/atlasRaster/buildAtlasRaster.mjs --archive <ns-….pmtiles> --out <dir> [options]
//
// Options: --revision atlas-raster-YYYYMMDD.n  --zoom 9-13  --styles day,fletcher
//          --bbox west,south,east,north  --workers 4  --osm-cache <dir>  --force
//          --angle metal|swiftshader  --quality 0.9|lossless  --port 4790
//          --timeout <seconds per metatile>  --review <dir> [--review-point lon,lat]

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ATLAS_MODES, bundleAtlasStyle, loadAtlasStyleModule, rewriteStyleForRender, styleJson, styleSha256 } from './atlasStyle.mjs';
import { readArchiveCoverage, verifyArchive } from './archive.mjs';
import { checkCrownAtlas } from '../checkCrownAtlas.mjs';
import { Coverage } from './coverage.mjs';
import { defaultAngle, launchRenderer } from './renderer.mjs';
import { MAX_UPSTREAM_IN_FLIGHT, startRenderServer, USER_AGENT } from './renderServer.mjs';
import {
  bboxToTileRange, METATILE_BUFFER_TILES, METATILE_TILES, metatileOrigin, metatileView, parseBbox, parseZoomRange, tileContaining,
} from './tileMath.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDir, '../..');
const GENERATOR = 'web/scripts/atlasRaster/buildAtlasRaster.mjs';
const ZOOM_RANGE = [5, 13];
const PIXEL_RATIO = 2;
const IMAGE_PIXELS = 1024;
const DEFAULT_PORT = 4790;
const DEFAULT_QUALITY = 0.9;
const DEFAULT_TIMEOUT_SECONDS = 180;
/**
 * Open Atlantic south-east of Nova Scotia. Every zoom-5 to zoom-13 tile holding
 * this point is pure ocean in OpenFreeMap and outside the provincial archive;
 * the zoom-5 tile around -62, 42 is the province's own tile and the one around
 * -62, 38 holds Bermuda, so the point sits further out.
 */
const OCEAN_POINT = [-50, 38];
const DEFAULT_REVIEW_POINT = [-61.5, 45.87];

function usageText() {
  return `Usage: node scripts/atlasRaster/buildAtlasRaster.mjs --archive <ns-….pmtiles> --out <dir> [options]

  --revision <atlas-raster-YYYYMMDD.n>  default: today's UTC date, .1
  --zoom <min-max>                      within ${ZOOM_RANGE.join('-')} (default all)
  --styles <day,night,fletcher>         default all three
  --bbox <west,south,east,north>        only metatiles intersecting this extent
  --workers <n>                         parallel render pages (default 4)
  --osm-cache <dir>                     OpenFreeMap tile cache (default <out>/.osm-cache)
  --force                               re-render tiles that already exist
  --angle <metal|swiftshader>           WebGL backend (default ${defaultAngle()} on this platform)
  --quality <0-1|lossless>              WebP quality (default ${DEFAULT_QUALITY})
  --port <n>                            local render server port (default ${DEFAULT_PORT})
  --timeout <seconds>                   per-metatile idle timeout (default ${DEFAULT_TIMEOUT_SECONDS})
  --review <dir> [--review-point lon,lat]  save metatile PNGs and a 2x2 seam check for review`;
}

function parseArgs(argv) {
  const options = {
    archive: null, out: null, revision: null, zoom: ZOOM_RANGE, styles: ATLAS_MODES, bbox: null, workers: 4, osmCache: null,
    force: false, angle: defaultAngle(), quality: DEFAULT_QUALITY, port: DEFAULT_PORT, timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
    review: null, reviewPoint: DEFAULT_REVIEW_POINT,
  };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    const value = () => {
      const next = argv[++index];
      if (next === undefined || next.startsWith('--')) throw new Error(`${flag} needs a value.`);
      return next;
    };
    switch (flag) {
      case '--help': case '-h': console.log(usageText()); process.exit(0); break;
      case '--archive': options.archive = path.resolve(value()); break;
      case '--out': options.out = path.resolve(value()); break;
      case '--revision': options.revision = value(); break;
      case '--zoom': options.zoom = parseZoomRange(value()); break;
      case '--styles': options.styles = value().split(',').map((style) => style.trim()).filter(Boolean); break;
      case '--bbox': options.bbox = parseBbox(value()); break;
      case '--workers': options.workers = Number(value()); break;
      case '--osm-cache': options.osmCache = path.resolve(value()); break;
      case '--force': options.force = true; break;
      case '--angle': options.angle = value(); break;
      case '--quality': { const raw = value(); options.quality = raw === 'lossless' ? 'lossless' : Number(raw); break; }
      case '--port': options.port = Number(value()); break;
      case '--timeout': options.timeoutSeconds = Number(value()); break;
      case '--review': options.review = path.resolve(value()); break;
      case '--review-point': options.reviewPoint = value().split(',').map(Number); break;
      default: throw new Error(`Unknown option ${flag}. Run with --help.`);
    }
  }
  if (!options.archive) throw new Error('--archive <path to the pinned provincial .pmtiles> is required.');
  if (!options.out) throw new Error('--out <directory> is required.');
  if (options.zoom[0] < ZOOM_RANGE[0] || options.zoom[1] > ZOOM_RANGE[1]) throw new Error(`--zoom must stay within ${ZOOM_RANGE.join('-')}.`);
  for (const style of options.styles) if (!ATLAS_MODES.includes(style)) throw new Error(`Unknown style "${style}"; choose from ${ATLAS_MODES.join(', ')}.`);
  if (!Number.isInteger(options.workers) || options.workers < 1) throw new Error('--workers must be a positive whole number.');
  if (options.quality !== 'lossless' && !(options.quality > 0 && options.quality <= 1)) throw new Error('--quality must be between 0 and 1, or "lossless".');
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) throw new Error('--port must be a TCP port number.');
  if (!(options.timeoutSeconds > 0)) throw new Error('--timeout must be a positive number of seconds.');
  if (options.reviewPoint.length !== 2 || options.reviewPoint.some((n) => !Number.isFinite(n))) throw new Error('--review-point must be lon,lat.');
  options.revision ??= `atlas-raster-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}.1`;
  if (!/^[\w.-]+$/.test(options.revision)) throw new Error('--revision may only contain letters, digits, dots, dashes and underscores.');
  options.osmCache ??= path.join(options.out, '.osm-cache');
  return options;
}

const log = (message) => console.error(`[atlas-raster] ${message}`);
const exists = (file) => stat(file).then(() => true, () => false);
const tilePath = (revisionDir, style, z, x, y) => path.join(revisionDir, style, String(z), String(x), `${y}.webp`);
const oceanPath = (revisionDir, style, z) => path.join(revisionDir, style, 'ocean', `${z}.webp`);
const hexToRgb = (hex) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function writeAtomic(file, bytes) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, bytes);
  await rename(temp, file);
}

function decodeWebp(base64, context) {
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length < 16 || bytes.toString('latin1', 0, 4) !== 'RIFF' || bytes.toString('latin1', 8, 12) !== 'WEBP') {
    throw new Error(`${context}: encoder did not return a WebP image.`);
  }
  return bytes;
}

function gitState() {
  const run = (args) => execFileSync('git', args, { cwd: webRoot, encoding: 'utf8' }).trim();
  const commit = run(['rev-parse', 'HEAD']);
  const modified = run(['status', '--porcelain', '--untracked-files=no']).split('\n').filter(Boolean).length;
  return { commit, workingTree: modified === 0 ? 'clean' : `modified: ${modified} tracked paths` };
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '?';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  return h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`;
}

/** Walk one style directory: per-zoom counts and bytes, the tile set, and ocean stand-ins. */
async function scanStyle(revisionDir, style) {
  const root = path.join(revisionDir, style);
  const coverage = new Coverage();
  const counts = {};
  const bytes = {};
  const ocean = {};
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'ocean') {
      for (const file of await readdir(path.join(root, 'ocean'))) {
        const match = /^(\d+)\.webp$/.exec(file);
        if (match) ocean[match[1]] = (await stat(path.join(root, 'ocean', file))).size;
      }
      continue;
    }
    if (!/^\d+$/.test(entry.name)) continue;
    const z = Number(entry.name);
    for (const column of await readdir(path.join(root, entry.name), { withFileTypes: true })) {
      if (!column.isDirectory() || !/^\d+$/.test(column.name)) continue;
      const x = Number(column.name);
      for (const file of await readdir(path.join(root, entry.name, column.name))) {
        const match = /^(\d+)\.webp$/.exec(file);
        if (!match) continue;
        const y = Number(match[1]);
        coverage.add(z, x, y);
        counts[z] = (counts[z] ?? 0) + 1;
        bytes[z] = (bytes[z] ?? 0) + (await stat(path.join(root, entry.name, column.name, file))).size;
      }
    }
  }
  return { coverage, counts, bytes, ocean };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const started = performance.now();
  const revisionDir = path.join(options.out, options.revision);
  const provincialReceipt = JSON.parse(await readFile(path.join(webRoot, 'public/atlas/provincial/source.json'), 'utf8'));
  const crownReceipt = await checkCrownAtlas(path.join(webRoot, 'public/atlas/crown'));

  log(`Verifying ${options.archive} against the provincial receipt…`);
  const archive = await verifyArchive(options.archive, provincialReceipt);
  const { header, coverage } = await readArchiveCoverage(options.archive);
  if (header.minZoom !== provincialReceipt.minzoom || header.maxZoom !== provincialReceipt.maxzoom) {
    throw new Error(`Archive zoom range ${header.minZoom}-${header.maxZoom} differs from the receipt's ${provincialReceipt.minzoom}-${provincialReceipt.maxzoom}.`);
  }
  log(`Archive ok: ${coverage.total()} addressed tiles, zooms ${header.minZoom}-${header.maxZoom}.`);

  // Plan: one job per metatile that still has tiles to write, plus ocean stand-ins.
  const [zMin, zMax] = options.zoom;
  const timeoutMs = options.timeoutSeconds * 1000;
  const reviewTargets = new Map();
  const jobs = [];
  let planned = 0;
  let skipped = 0;
  const makeJob = (style, z, mx, my, slices, extra) => ({
    style, ...metatileView(z, mx, my), slices, quality: options.quality, timeoutMs, ...extra,
  });
  for (const style of options.styles) {
    for (let z = zMin; z <= zMax; z++) {
      const range = options.bbox ? bboxToTileRange(options.bbox, z) : null;
      for (const block of coverage.metatiles(z, { range })) {
        const slices = [];
        for (const [x, y] of block.tiles) {
          if (options.force || !(await exists(tilePath(revisionDir, style, z, x, y)))) slices.push([x, y]);
          else skipped++;
        }
        if (slices.length) jobs.push(makeJob(style, z, block.mx, block.my, slices, { ocean: false }));
        planned += slices.length;
      }
      const ocean = tileContaining(OCEAN_POINT[0], OCEAN_POINT[1], z);
      if (coverage.has(z, ocean.x, ocean.y)) throw new Error(`Ocean stand-in ${z}/${ocean.x}/${ocean.y} is inside provincial coverage.`);
      if (options.force || !(await exists(oceanPath(revisionDir, style, z)))) {
        const { mx, my } = metatileOrigin(ocean.x, ocean.y);
        jobs.push(makeJob(style, z, mx, my, [[ocean.x, ocean.y]], { ocean: true }));
        planned++;
      } else skipped++;
    }
    if (options.review) {
      const point = tileContaining(options.reviewPoint[0], options.reviewPoint[1], zMax);
      const { mx, my } = metatileOrigin(point.x, point.y);
      const pngName = `${style}-z${zMax}-${mx}-${my}.png`;
      reviewTargets.set(style, { z: zMax, mx, my, pngName });
      const job = jobs.find((candidate) => candidate.style === style && candidate.zoom === zMax && candidate.mx === mx && candidate.my === my && !candidate.ocean);
      if (job) job.pngName = pngName;
      else jobs.push(makeJob(style, zMax, mx, my, [], { ocean: false, pngName }));
    }
  }
  log(`Plan: ${planned} tiles in ${jobs.length} metatile renders (${skipped} already present) for ${options.styles.join(', ')} at zooms ${zMin}-${zMax}${options.bbox ? ' inside the bbox' : ''}.`);

  await mkdir(revisionDir, { recursive: true });
  await mkdir(options.osmCache, { recursive: true });
  if (options.review) await mkdir(options.review, { recursive: true });
  const origin = `http://127.0.0.1:${options.port}`;

  // The style bundle resolves its glyphs, sprite and archive against the render server.
  const { bundlePath, cleanup } = await bundleAtlasStyle({ webRoot, archiveBaseUrl: `${origin}/archive/` });
  let server;
  let renderer;
  const styleRecords = {};
  try {
    const styleModule = await loadAtlasStyleModule(bundlePath, `${origin}/`);
    let upstreamTileJson;
    const renderStyles = {};
    for (const mode of ATLAS_MODES) {
      const rewritten = rewriteStyleForRender(styleModule.buildAtlasStyle(mode), { geographyUrl: `${origin}/osm/planet.json` });
      upstreamTileJson = rewritten.upstreamTileJson;
      renderStyles[mode] = styleJson(rewritten.style);
      styleRecords[mode] = { name: `NS Marks Atlas · ${styleModule.atlasStyleLabels[mode]}`, styleSha256: styleSha256(rewritten.style) };
      if (mode === 'fletcher') styleRecords[mode].note = styleModule.FLETCHER_STYLE_NOTE;
    }

    server = await startRenderServer({
      port: options.port, webRoot, pageDir: scriptDir, archivePath: options.archive, archiveName: archive.archive,
      archiveEtag: archive.sha256.slice(0, 16), upstreamTileJson, osmCache: options.osmCache, outputDir: revisionDir,
      reviewDir: options.review, log,
    });
    for (const [mode, json] of Object.entries(renderStyles)) server.setStyle(mode, json);
    await server.warmTileJson();
    log(`Render server at ${server.origin}; OpenFreeMap tiles via ${server.stats.upstreamTiles} (TileJSON fetched ${server.stats.upstreamTileJsonFetchedAt}).`);

    renderer = await launchRenderer({
      angle: options.angle, workers: Math.min(options.workers, Math.max(jobs.length, 1)), origin: server.origin, timeoutMs,
      sizeCss: (METATILE_TILES + 2 * METATILE_BUFFER_TILES) * 512, log,
    });
    log(`Chromium ${renderer.browserVersion}, maplibre-gl ${renderer.info.maplibre}, WebGL "${renderer.info.webglRenderer}", ${renderer.workers} worker page(s).`);

    // Render, writing every slice atomically; a job that reports any MapLibre error rejects.
    let done = 0;
    let metatilesDone = 0;
    let metatileSeconds = 0;
    let lastReport = 0;
    const renderStarted = performance.now();
    const report = (force) => {
      const now = performance.now();
      if (!force && now - lastReport < 1000) return;
      lastReport = now;
      const elapsed = (now - renderStarted) / 1000;
      const rate = done / Math.max(elapsed, 1e-9);
      const eta = rate > 0 ? (planned - done) / rate : Infinity;
      log(`tiles ${done}/${planned} (${(100 * done / Math.max(planned, 1)).toFixed(1)}%) · ${rate.toFixed(2)} tiles/s · ${(metatileSeconds / Math.max(metatilesDone, 1)).toFixed(1)} s/metatile · ETA ${formatDuration(eta)}`);
    };
    await renderer.run(jobs, async (job, result, timing) => {
      metatilesDone++;
      metatileSeconds += timing.seconds;
      for (const slice of result.slices) {
        const context = `${job.style} ${job.zoom}/${slice.x}/${slice.y}`;
        const bytes = decodeWebp(slice.base64, context);
        if (job.ocean) {
          // Day and Night ocean is one flat water colour; Fletcher lays paper grain over it.
          if (job.style !== 'fletcher') {
            const water = hexToRgb(styleModule.atlasPalettes[job.style].water);
            const off = Math.max(...slice.colour.map((channel, index) => Math.abs(channel - water[index])));
            if (!slice.uniform) throw new Error(`Ocean stand-in ${context} is not a uniform water tile.`);
            if (off > 1) throw new Error(`Ocean stand-in ${context} is colour ${slice.colour}, not the style's water ${water}.`);
          }
          await writeAtomic(oceanPath(revisionDir, job.style, job.zoom), bytes);
        } else {
          await writeAtomic(tilePath(revisionDir, job.style, job.zoom, slice.x, slice.y), bytes);
        }
        done++;
      }
      if (job.pngName) log(`Review metatile ${job.pngName} (${(result.pngBytes / 1e6).toFixed(1)} MB) written to ${options.review}.`);
      report(false);
    });
    report(true);
    const renderSeconds = (performance.now() - renderStarted) / 1000;

    // Seam check: a 2x2 block straddling the review metatile's east edge, assembled from the written tiles.
    for (const [style, target] of reviewTargets) {
      const candidates = [];
      for (let row = 0; row < METATILE_TILES - 1; row++) {
        candidates.push({ x: target.mx + METATILE_TILES - 1, y: target.my + row });
        candidates.push({ x: target.mx + row, y: target.my + METATILE_TILES - 1 });
      }
      for (const { x, y } of candidates) {
        const block = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]];
        const present = await Promise.all(block.map(([tx, ty]) => exists(tilePath(revisionDir, style, target.z, tx, ty))));
        if (!present.every(Boolean)) continue;
        const url = ([tx, ty]) => `${server.origin}/out/${style}/${target.z}/${tx}/${ty}.webp`;
        const name = `seam-${style}-z${target.z}-${x}-${y}.png`;
        await renderer.assemble({ name, rows: [[url(block[0]), url(block[1])], [url(block[2]), url(block[3])]] });
        log(`Seam check ${name}: tiles ${target.z}/${x}..${x + 1}/${y}..${y + 1} assembled in ${options.review}.`);
        break;
      }
    }

    // Describe what is on disk now, not just this run, so a resumed revision has an accurate receipt.
    const scans = {};
    for (const style of ATLAS_MODES) {
      const scan = await scanStyle(revisionDir, style);
      if (scan) scans[style] = scan;
    }
    const present = Object.keys(scans);
    if (present.length === 0) throw new Error('No tiles were written.');
    for (const [style, scan] of Object.entries(scans)) {
      for (const z of scan.coverage.zoomLevels()) {
        for (const [x, y] of scan.coverage.tiles(z)) {
          if (!coverage.has(z, x, y)) throw new Error(`${style}/${z}/${x}/${y}.webp is outside the archive's coverage; remove it before publishing.`);
        }
      }
    }
    const rendered = new Coverage();
    const [first, ...others] = present;
    for (const z of scans[first].coverage.zoomLevels()) {
      for (const [x, y] of scans[first].coverage.tiles(z)) {
        if (others.every((style) => scans[style].coverage.has(z, x, y))) rendered.add(z, x, y);
      }
    }
    for (const style of present) {
      const extra = scans[style].coverage.total() - rendered.total();
      if (extra > 0) log(`WARNING: ${style} holds ${extra} tiles the other rendered styles lack; coverage.json lists only addresses present in every rendered style.`);
    }
    for (const style of ATLAS_MODES) if (!present.includes(style)) log(`WARNING: no ${style} tiles on disk; the revision is incomplete until every style is rendered.`);
    const renderedRange = rendered.zoomRange() ?? options.zoom;
    for (const style of present) {
      for (let z = renderedRange[0]; z <= renderedRange[1]; z++) {
        if (!scans[style].ocean[z]) throw new Error(`${style}/ocean/${z}.webp is missing.`);
      }
    }

    const coverageDocument = rendered.toRows();
    coverageDocument.zoomRange = renderedRange;
    await writeAtomic(path.join(revisionDir, 'coverage.json'), JSON.stringify(coverageDocument, null, 2));

    const fontsReceipt = JSON.parse(await readFile(path.join(webRoot, 'public/atlas/fonts/source.json'), 'utf8'));
    const spriteFiles = {};
    for (const file of ['sprite.json', 'sprite.png', 'sprite@2x.json', 'sprite@2x.png']) {
      spriteFiles[file] = sha256(await readFile(path.join(webRoot, 'public/atlas/sprite', file)));
    }
    const git = gitState();
    const averageBytesByZoom = {};
    for (let z = renderedRange[0]; z <= renderedRange[1]; z++) {
      averageBytesByZoom[String(z)] = Object.fromEntries(present.map((style) => [style, scans[style].counts[z] ? Math.round(scans[style].bytes[z] / scans[style].counts[z]) : 0]));
    }
    const styleBytes = Object.fromEntries(ATLAS_MODES.map((style) => [style, scans[style]
      ? Object.values(scans[style].bytes).reduce((sum, value) => sum + value, 0) + Object.values(scans[style].ocean).reduce((sum, value) => sum + value, 0)
      : 0]));
    const oceanAddresses = {};
    for (let z = renderedRange[0]; z <= renderedRange[1]; z++) oceanAddresses[String(z)] = tileContaining(OCEAN_POINT[0], OCEAN_POINT[1], z);
    const totalTiles = present.reduce((sum, style) => sum + scans[style].coverage.total() + Object.keys(scans[style].ocean).length, 0);

    const receipt = {
      schemaVersion: 1,
      revision: options.revision,
      generatedAt: new Date().toISOString(),
      generator: GENERATOR,
      sourceCommit: git.commit,
      sourceWorkingTree: git.workingTree,
      renderer: {
        maplibreGl: renderer.info.maplibre,
        chromium: renderer.browserVersion,
        angle: renderer.angle,
        webglRenderer: renderer.info.webglRenderer,
        pixelRatio: PIXEL_RATIO,
        imagePixels: IMAGE_PIXELS,
        tileScheme: 'XYZ; tile (z,x,y) = standard Web Mercator extent rendered at MapLibre zoom z (512 CSS px per tile)',
        format: 'webp',
        quality: options.quality,
        metatile: { tiles: METATILE_TILES, bufferTiles: METATILE_BUFFER_TILES },
        renderOrigin: server.origin,
      },
      styles: styleRecords,
      provincial: {
        archive: archive.archive,
        sha256: archive.sha256,
        bytes: archive.bytes,
        generatedAt: provincialReceipt.generatedAt,
        minzoom: provincialReceipt.minzoom,
        maxzoom: provincialReceipt.maxzoom,
        attribution: provincialReceipt.attribution,
        licenceUrl: provincialReceipt.licenceUrl,
        sources: provincialReceipt.sources,
      },
      crownLand: crownReceipt,
      supplemental: {
        name: 'OpenFreeMap',
        tileJson: upstreamTileJson,
        tiles: server.stats.upstreamTiles,
        fetchedAt: server.stats.upstreamTileJsonFetchedAt,
        attribution: 'OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors',
        userAgent: USER_AGENT,
        maxInFlight: MAX_UPSTREAM_IN_FLIGHT,
        tilesFetched: server.stats.tilesFetched,
        tilesFromCache: server.stats.tilesCached,
      },
      fonts: fontsReceipt,
      sprite: { generator: 'scripts/buildAtlasSprite.mjs', files: spriteFiles },
      zoomRange: renderedRange,
      coverage: {
        rule: 'tile rendered iff the provincial archive holds a tile at that address',
        file: 'coverage.json',
        counts: rendered.counts(),
        total: rendered.total(),
      },
      ocean: oceanAddresses,
      tiles: {
        perStyle: rendered.total(),
        total: totalTiles,
        bytes: styleBytes,
        averageBytesByZoom,
      },
    };
    await writeAtomic(path.join(revisionDir, 'source.json'), JSON.stringify(receipt, null, 2));

    // Summary and a full-province projection from the archive's own coverage.
    const metatilesPerStyle = coverage.zoomLevels().reduce((sum, z) => sum + coverage.metatiles(z).length, 0);
    const secondsPerMetatile = metatileSeconds / Math.max(metatilesDone, 1);
    const wallSecondsPerMetatile = renderSeconds / Math.max(metatilesDone, 1);
    const projectedBytes = Object.fromEntries(present.map((style) => [style, coverage.zoomLevels().reduce((sum, z) => {
      const average = averageBytesByZoom[String(z)]?.[style];
      return sum + (average ? average * coverage.countAt(z) : 0);
    }, 0)]));
    const totalSeconds = (performance.now() - started) / 1000;
    log(`Done in ${formatDuration(totalSeconds)}: wrote ${done} tiles (${metatilesDone} metatile renders, ${secondsPerMetatile.toFixed(1)} s each per worker, ${wallSecondsPerMetatile.toFixed(2)} s wall each, ${(done / Math.max(renderSeconds, 1e-9)).toFixed(2)} tiles/s); OpenFreeMap ${server.stats.tilesFetched} fetched, ${server.stats.tilesCached} from cache.`);
    log(`Receipt ${path.join(revisionDir, 'source.json')}; coverage ${rendered.total()} addresses per style at zooms ${renderedRange.join('-')}.`);
    if (metatilesDone > 0) {
      const projectedSeconds = metatilesPerStyle * ATLAS_MODES.length * wallSecondsPerMetatile;
      log(`Full province at zooms ${ZOOM_RANGE.join('-')}: ${coverage.total()} tiles in ${metatilesPerStyle} metatiles per style; at this run's pace about ${formatDuration(projectedSeconds)} for all three styles` +
        ` (${Object.entries(projectedBytes).map(([style, bytes]) => `${style} ≈ ${(bytes / 1e6).toFixed(0)} MB`).join(', ')}, using this run's per-zoom averages where measured).`);
    }
    if (renderer.consoleErrors()) log(`WARNING: ${renderer.consoleErrors()} console error(s) were logged by the render pages; see above.`);
  } finally {
    await renderer?.close();
    await server?.close();
    await cleanup();
  }
}

main().catch((error) => {
  log(`FAILED: ${error.message ?? error}`);
  if (process.env.ATLAS_RASTER_DEBUG) console.error(error.stack);
  process.exit(1);
});
