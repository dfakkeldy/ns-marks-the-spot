// The raster package renders the web map's real cartography. `src/atlas/style.ts`
// is bundled with Vite (the project's bundler; MapLibre types are the only
// import it does not inline) and evaluated in Node with `document.baseURI`
// shimmed to the local render server, so glyphs, sprite and the provincial
// archive resolve exactly as they do in the browser. Nothing here restates a
// layer; only the supplemental OpenFreeMap source URL is redirected to the
// caching proxy.

import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const ATLAS_MODES = ['day', 'night', 'fletcher'];
export const OPENFREEMAP_ORIGIN = 'https://tiles.openfreemap.org/';

/**
 * Bundle style.ts, basemap.ts and palette.ts into one ESM file. `archiveBaseUrl`
 * replaces VITE_PROVINCIAL_ATLAS_BASE_URL so provincialTileUrl() points at the
 * render server's copy of the pinned archive.
 */
export async function bundleAtlasStyle({ webRoot, archiveBaseUrl }) {
  const { build } = await import('vite');
  const workDir = await mkdtemp(path.join(tmpdir(), 'atlas-raster-style-'));
  const entry = path.join(workDir, 'entry.ts');
  const source = (file) => JSON.stringify(path.join(webRoot, 'src/atlas', file));
  await writeFile(entry, [
    `export { buildAtlasStyle, atlasFonts } from ${source('style.ts')};`,
    `export { atlasStyleLabels, FLETCHER_STYLE_NOTE } from ${source('basemap.ts')};`,
    `export { atlasPalettes } from ${source('palette.ts')};`,
    '',
  ].join('\n'));
  await build({
    root: webRoot,
    configFile: false,
    envDir: false,
    logLevel: 'warn',
    define: { 'import.meta.env.VITE_PROVINCIAL_ATLAS_BASE_URL': JSON.stringify(archiveBaseUrl) },
    build: {
      outDir: workDir, emptyOutDir: false, minify: false, sourcemap: false, target: 'esnext', write: true,
      lib: { entry, formats: ['es'], fileName: () => 'atlasStyle.bundle.mjs' },
    },
  });
  return { bundlePath: path.join(workDir, 'atlasStyle.bundle.mjs'), cleanup: () => rm(workDir, { recursive: true, force: true }) };
}

/** Evaluate the bundle with document.baseURI set to the render server root. */
export async function loadAtlasStyleModule(bundlePath, baseUri) {
  if (globalThis.document === undefined) globalThis.document = { baseURI: baseUri };
  else if (globalThis.document.baseURI !== baseUri) throw new Error('document.baseURI is already defined with another value.');
  return import(pathToFileURL(bundlePath).href);
}

/**
 * Point the style's `geography` source at the local proxy TileJSON. Every other
 * source and layer is kept byte for byte.
 */
export function rewriteStyleForRender(style, { geographyUrl }) {
  const geography = style.sources?.geography;
  if (!geography || geography.type !== 'vector' || typeof geography.url !== 'string' || !geography.url.startsWith(OPENFREEMAP_ORIGIN)) {
    throw new Error('Atlas style has no OpenFreeMap "geography" vector source to proxy.');
  }
  const copy = structuredClone(style);
  copy.sources.geography.url = geographyUrl;
  return { style: copy, upstreamTileJson: geography.url };
}

export function styleJson(style) {
  return JSON.stringify(style);
}

export function styleSha256(style) {
  return createHash('sha256').update(styleJson(style)).digest('hex');
}
