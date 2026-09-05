#!/usr/bin/env node
// Build the self-hosted MapLibre glyph ranges for the Atlas basemap.
//
// MapLibre labels are drawn from signed-distance-field glyph atlases, not from
// CSS web fonts, so every face the Atlas style names must exist as
// `<stack>/<start>-<end>.pbf` range files. This script downloads pinned
// open-licensed fonts, verifies them, rasterizes each glyph's TrueType outline
// itself (no system font matching, so the wrong face can never be substituted)
// and converts it the way fontnik / sdf-glyph-foundry do (24 px, 3 px buffer,
// radius 8, cutoff 0.25, top = glyph top - ascender). All 256 Basic
// Multilingual Plane ranges are written per face, so a rare character never
// turns into a missing-range error.
//
//   node scripts/buildAtlasGlyphs.mjs [--out public/atlas/fonts] [--cache <dir>] [--only "Stack A,Stack B"]
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { createCanvas } from 'canvas';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const argv = process.argv.slice(2);
const option = (name, fallback) => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : fallback; };
const outDir = path.resolve(root, option('--out', 'public/atlas/fonts'));
const cacheDir = path.resolve(root, option('--cache', 'node_modules/.cache/atlas-fonts'));
const only = option('--only', '')?.split(',').map(value => value.trim()).filter(Boolean) ?? [];

// fontnik / sdf-glyph-foundry parameters. MapLibre's glyph parser assumes the 3 px border.
const FONT_SIZE = 24;
const BUFFER = 3;
const RADIUS = 8;
const CUTOFF = 0.25;
const RANGE = 256;
const LAST_RANGE = 65536;
const CANVAS = 160;

const GOOGLE_FONTS = 'https://raw.githubusercontent.com/google/fonts/5e35378e6bda803962ee6fd257e444a7d459660d/ofl';
const LIBRE_BASKERVILLE = 'https://raw.githubusercontent.com/impallari/Libre-Baskerville/9852edf75ece3af500a5ec61245f94788c3d4633';
const NOTO_SANS = { url: 'https://github.com/notofonts/latin-greek-cyrillic/releases/download/NotoSans-v2.015/NotoSans-v2.015.zip',
  sha256: '0c34df072a3fa7efbb7cbf34950e1f971a4447cffe365d3a359e2d4089b958f5' };

/**
 * Licence texts shipped beside the ranges. `reservedFontName` is recorded only
 * where the shipped OFL text declares one: Libre Baskerville does; the Noto
 * OFL text declares none ("Noto" is a Google trademark, a separate matter).
 */
const licences = {
  'Libre Baskerville': { file: 'OFL-Libre-Baskerville.txt', url: `${GOOGLE_FONTS}/librebaskerville/OFL.txt`,
    sha256: '3624eddd4c8f8a908130a417ae7cd089c9da69899c4e0ca1a5217d0a6fae16fd', reservedFontName: 'Libre Baskerville' },
  'Noto Sans': { file: 'OFL-Noto-Sans.txt', archive: NOTO_SANS, member: 'OFL.txt',
    sha256: 'cee9892f9f0cc8fe882c9e9537ee6a89621d86ee7ceaf70b02e2b2b1c25c061a', reservedFontName: null, trademark: 'Noto is a trademark of Google LLC' },
};

/**
 * Pinned upstream releases. `stack` is the MapLibre fontstack directory name.
 * SDF glyph ranges are a Modified Version under the SIL Open Font License, so
 * the stacks carry project names rather than the fonts' own names; `family`
 * records what each stack derives from.
 */
export const fonts = [
  { stack: 'Atlas Serif Regular', family: 'Libre Baskerville', style: 'Regular', version: '2.005',
    url: `${LIBRE_BASKERVILLE}/fonts/ttf/LibreBaskerville-Regular.ttf`, sha256: 'df9fddf43dbd7de435c316b86a52b3d6b3ad2f6fb2ed3f6fd8bdc1835f30eec1' },
  { stack: 'Atlas Serif Italic', family: 'Libre Baskerville', style: 'Italic', version: '2.005',
    url: `${LIBRE_BASKERVILLE}/fonts/ttf/LibreBaskerville-Italic.ttf`, sha256: '82d05fab9a1c07f4eb4bc891fb0043a74fba1bed27ea919f61d94dbc5b54a4f6' },
  { stack: 'Atlas Sans Regular', family: 'Noto Sans', style: 'Regular', version: '2.015',
    archive: NOTO_SANS, member: 'NotoSans/unhinted/ttf/NotoSans-Regular.ttf', sha256: 'f3961a9cde016d41a4879aecda1474d3a36d6bf54fa0e4643de029cc2248b0e8' },
];

const README = `NS Marks Atlas label glyphs

MapLibre draws map labels from signed-distance-field glyph ranges
(<stack>/<start>-<end>.pbf), not from CSS web fonts. These ranges are
generated from pinned open-licensed fonts by scripts/buildAtlasGlyphs.mjs,
which rasterizes each glyph's own TrueType outline; source.json records each
stack's upstream font release, checksum, licence and glyph count.

  Atlas Serif Regular / Atlas Serif Italic  derived from Libre Baskerville
  Atlas Sans Regular                        derived from Noto Sans

Both fonts are licensed under the SIL Open Font License 1.1 (texts beside this
file). Libre Baskerville declares the Reserved Font Name "Libre Baskerville";
the Noto OFL text declares no Reserved Font Name, and "Noto" is a Google
trademark. Converting a font to glyph ranges makes a Modified Version under the
OFL, so the stacks use project names and the upstream names appear only as the
derivation record. The ranges stay under the OFL and are not covered by the
repository's MIT code licence. Serving them with the app means no font host is
contacted for map lettering.
`;

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function fetchVerified(url, expected) {
  await mkdir(cacheDir, { recursive: true });
  const cached = path.join(cacheDir, expected);
  try {
    const bytes = await readFile(cached);
    if (sha256(bytes) === expected) return bytes;
  } catch { /* download below */ }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = sha256(bytes);
  if (actual !== expected) throw new Error(`${url}: sha256 ${actual} does not match pinned ${expected}`);
  await writeFile(cached, bytes);
  return bytes;
}

async function fetchFile(source) {
  if (source.archive) {
    const zip = unzipSync(await fetchVerified(source.archive.url, source.archive.sha256));
    const bytes = zip[source.member];
    if (!bytes) throw new Error(`${source.archive.url} has no member ${source.member}`);
    const actual = sha256(bytes);
    if (actual !== source.sha256) throw new Error(`${source.member}: sha256 ${actual} does not match pinned ${source.sha256}`);
    return Buffer.from(bytes);
  }
  return fetchVerified(source.url, source.sha256);
}

/** Minimal TrueType reader: metrics, the Unicode cmap and `glyf` outlines. */
function parseFont(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = {};
  for (let i = 0; i < view.getUint16(4); i++) {
    const record = 12 + i * 16;
    const tag = String.fromCharCode(bytes[record], bytes[record + 1], bytes[record + 2], bytes[record + 3]);
    tables[tag] = { offset: view.getUint32(record + 8), length: view.getUint32(record + 12) };
  }
  for (const required of ['head', 'hhea', 'hmtx', 'maxp', 'cmap', 'loca', 'glyf']) {
    if (!tables[required]) throw new Error(`Font has no ${required} table; only TrueType outlines are supported`);
  }
  const unitsPerEm = view.getUint16(tables.head.offset + 18);
  const longLoca = view.getInt16(tables.head.offset + 50) === 1;
  const ascender = view.getInt16(tables.hhea.offset + 4);
  const metricCount = view.getUint16(tables.hhea.offset + 34);
  const glyphCount = view.getUint16(tables.maxp.offset + 4);
  const advance = (glyph) => view.getUint16(tables.hmtx.offset + Math.min(glyph, metricCount - 1) * 4);
  const location = (glyph) => longLoca
    ? [view.getUint32(tables.loca.offset + glyph * 4), view.getUint32(tables.loca.offset + glyph * 4 + 4)]
    : [view.getUint16(tables.loca.offset + glyph * 2) * 2, view.getUint16(tables.loca.offset + glyph * 2 + 2) * 2];

  const codepoints = new Map(); // codepoint -> glyph id
  const cmap = tables.cmap.offset;
  for (let i = 0; i < view.getUint16(cmap + 2); i++) {
    const platform = view.getUint16(cmap + 4 + i * 8);
    const encoding = view.getUint16(cmap + 6 + i * 8);
    if (!(platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10)))) continue;
    const sub = cmap + view.getUint32(cmap + 8 + i * 8);
    const format = view.getUint16(sub);
    if (format === 4) {
      const segments = view.getUint16(sub + 6) / 2;
      const ends = sub + 14, starts = ends + 2 + segments * 2, deltas = starts + segments * 2, offsets = deltas + segments * 2;
      for (let s = 0; s < segments; s++) {
        const end = view.getUint16(ends + s * 2), start = view.getUint16(starts + s * 2);
        const delta = view.getInt16(deltas + s * 2), rangeOffset = view.getUint16(offsets + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let glyph;
          if (rangeOffset === 0) glyph = (c + delta) & 0xffff;
          else {
            const address = offsets + s * 2 + rangeOffset + (c - start) * 2;
            if (address + 2 > bytes.byteLength) continue;
            glyph = view.getUint16(address);
            if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
          }
          if (glyph !== 0 && !codepoints.has(c)) codepoints.set(c, glyph);
        }
      }
    } else if (format === 12) {
      const groups = view.getUint32(sub + 12);
      for (let g = 0; g < groups; g++) {
        const start = view.getUint32(sub + 16 + g * 12), end = view.getUint32(sub + 20 + g * 12), first = view.getUint32(sub + 24 + g * 12);
        for (let c = start; c <= end && c < LAST_RANGE; c++) if (!codepoints.has(c)) codepoints.set(c, first + (c - start));
      }
    }
  }

  /** Outline contours in font units: arrays of {x, y, on}. Composite glyphs are flattened. */
  function outline(glyph, depth = 0) {
    if (glyph >= glyphCount || depth > 8) return [];
    const [start, end] = location(glyph);
    if (end <= start) return [];
    const base = tables.glyf.offset + start;
    const contourCount = view.getInt16(base);
    if (contourCount >= 0) {
      const endPoints = [];
      for (let c = 0; c < contourCount; c++) endPoints.push(view.getUint16(base + 10 + c * 2));
      const pointCount = contourCount ? endPoints[contourCount - 1] + 1 : 0;
      let cursor = base + 10 + contourCount * 2;
      cursor += 2 + view.getUint16(cursor); // instructions
      const flags = [];
      while (flags.length < pointCount) {
        const flag = bytes[cursor++];
        flags.push(flag);
        if (flag & 0x08) { let repeat = bytes[cursor++]; while (repeat-- > 0) flags.push(flag); }
      }
      const xs = [], ys = [];
      let x = 0;
      for (const flag of flags) {
        if (flag & 0x02) { const d = bytes[cursor++]; x += (flag & 0x10) ? d : -d; }
        else if (!(flag & 0x10)) { x += view.getInt16(cursor); cursor += 2; }
        xs.push(x);
      }
      let y = 0;
      for (const flag of flags) {
        if (flag & 0x04) { const d = bytes[cursor++]; y += (flag & 0x20) ? d : -d; }
        else if (!(flag & 0x20)) { y += view.getInt16(cursor); cursor += 2; }
        ys.push(y);
      }
      const contours = [];
      let first = 0;
      for (const last of endPoints) {
        const contour = [];
        for (let p = first; p <= last; p++) contour.push({ x: xs[p], y: ys[p], on: (flags[p] & 0x01) !== 0 });
        contours.push(contour);
        first = last + 1;
      }
      return contours;
    }
    // Composite glyph: transform each component's contours.
    const contours = [];
    let cursor = base + 10;
    for (;;) {
      const flags = view.getUint16(cursor), component = view.getUint16(cursor + 2);
      cursor += 4;
      let dx, dy;
      if (flags & 0x0001) { dx = view.getInt16(cursor); dy = view.getInt16(cursor + 2); cursor += 4; }
      else { dx = view.getInt8(cursor); dy = view.getInt8(cursor + 1); cursor += 2; }
      if (!(flags & 0x0002)) { dx = 0; dy = 0; } // point-matching placement is not used by these fonts
      let a = 1, b = 0, c = 0, d = 1;
      const f2dot14 = (offset) => view.getInt16(offset) / 16384;
      if (flags & 0x0008) { a = d = f2dot14(cursor); cursor += 2; }
      else if (flags & 0x0040) { a = f2dot14(cursor); d = f2dot14(cursor + 2); cursor += 4; }
      else if (flags & 0x0080) { a = f2dot14(cursor); b = f2dot14(cursor + 2); c = f2dot14(cursor + 4); d = f2dot14(cursor + 6); cursor += 8; }
      for (const contour of outline(component, depth + 1)) {
        contours.push(contour.map(p => ({ x: a * p.x + c * p.y + dx, y: b * p.x + d * p.y + dy, on: p.on })));
      }
      if (!(flags & 0x0020)) break;
    }
    return contours;
  }

  return { unitsPerEm, ascender, codepoints, advance, outline };
}

// Control characters and surrogates are never label text; skip them like fontnik's callers do.
const isRenderable = (c) => c >= 0x20 && !(c >= 0x7f && c <= 0x9f) && !(c >= 0xd800 && c <= 0xdfff) && c < LAST_RANGE;

/** TrueType quadratic contours to a canvas path (implicit on-curve midpoints between off-curve points). */
function tracePath(contours, context) {
  const mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  for (const points of contours) {
    if (points.length === 0) continue;
    let startIndex = points.findIndex(p => p.on);
    let start;
    if (startIndex === -1) { start = mid(points[points.length - 1], points[0]); startIndex = -1; }
    else start = points[startIndex];
    context.moveTo(start.x, start.y);
    let control = null;
    for (let k = 1; k <= points.length; k++) {
      const p = points[(startIndex + k + points.length) % points.length];
      if (startIndex === -1 && k === points.length) break; // all off-curve: every point is a control point
      if (p.on) {
        if (control) { context.quadraticCurveTo(control.x, control.y, p.x, p.y); control = null; }
        else context.lineTo(p.x, p.y);
      } else {
        if (control) { const m = mid(control, p); context.quadraticCurveTo(control.x, control.y, m.x, m.y); }
        control = p;
      }
    }
    if (startIndex === -1) {
      control = null;
      for (const p of points) {
        if (control) { const m = mid(control, p); context.quadraticCurveTo(control.x, control.y, m.x, m.y); }
        control = p;
      }
    }
    if (control) context.quadraticCurveTo(control.x, control.y, start.x, start.y);
    context.closePath();
  }
}

// Signed distance field of an anti-aliased raster (Felzenszwalb & Huttenlocher EDT),
// as in @mapbox/tiny-sdf, which MapLibre itself uses for locally rendered glyphs.
const INF = 1e20;
const alphaTable = new Float64Array(256);
for (let i = 0; i < 256; i++) { const d = 0.5 - Math.pow(i / 255, 1 / 2.2); alphaTable[i] = d * Math.abs(d); }
alphaTable[255] = -INF;
function edt1d(grid, offset, stride, length, f, v, z) {
  v[0] = 0; z[0] = -INF; z[1] = INF; f[0] = grid[offset];
  for (let q = 1, k = 0, s = 0; q < length; q++) {
    f[q] = grid[offset + q * stride];
    const q2 = q * q;
    do { const r = v[k]; s = (f[q] - f[r] + q2 - r * r) / (q - r) / 2; } while (s <= z[k] && --k > -1);
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  for (let q = 0, k = 0; q < length; q++) {
    while (z[k + 1] < q) k++;
    const r = v[k], qr = q - r;
    grid[offset + q * stride] = f[r] + qr * qr;
  }
}
function edt(data, width, height, f, v, z) {
  for (let x = 0; x < width; x++) edt1d(data, x, width, height, f, v, z);
  for (let y = 0; y < height; y++) edt1d(data, y * width, 1, width, f, v, z);
}

function createRasterizer(font) {
  const canvas = createCanvas(CANVAS, CANVAS);
  const context = canvas.getContext('2d');
  context.fillStyle = 'black';
  const scale = FONT_SIZE / font.unitsPerEm;
  const ascender = Math.ceil(font.ascender * scale); // FreeType rounds the scaled ascender up to whole pixels.
  const outer = new Float64Array(CANVAS * CANVAS), inner = new Float64Array(CANVAS * CANVAS);
  const f = new Float64Array(CANVAS), v = new Uint16Array(CANVAS), z = new Float64Array(CANVAS + 1);
  return (glyphId) => {
    const advance = Math.round(font.advance(glyphId) * scale);
    const contours = font.outline(glyphId);
    let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
    for (const contour of contours) for (const p of contour) {
      xMin = Math.min(xMin, p.x * scale); xMax = Math.max(xMax, p.x * scale);
      yMin = Math.min(yMin, p.y * scale); yMax = Math.max(yMax, p.y * scale);
    }
    const empty = { width: 0, height: 0, left: 0, top: -ascender, advance, bitmap: null };
    if (!Number.isFinite(xMin) || xMax - xMin <= 0 || yMax - yMin <= 0) return empty;
    const left = Math.floor(xMin), top = Math.ceil(yMax);
    const width = Math.min(CANVAS - 2 * BUFFER, Math.ceil(xMax) - left);
    const height = Math.min(CANVAS - 2 * BUFFER, top - Math.floor(yMin));
    if (width <= 0 || height <= 0) return empty;
    const bufferedWidth = width + 2 * BUFFER, bufferedHeight = height + 2 * BUFFER, length = bufferedWidth * bufferedHeight;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, CANVAS, CANVAS);
    // Font units to pixels: x right, y up, with the glyph box starting at the buffer.
    context.setTransform(scale, 0, 0, -scale, BUFFER - left, BUFFER + top);
    context.beginPath();
    tracePath(contours, context);
    context.fill('nonzero');
    context.setTransform(1, 0, 0, 1, 0, 0);
    const { data } = context.getImageData(0, 0, bufferedWidth, bufferedHeight);
    outer.fill(INF, 0, length); inner.fill(0, 0, length);
    for (let i = 0, p = 3; i < length; i++, p += 4) {
      const alpha = data[p];
      if (alpha === 0) continue;
      const t = alphaTable[alpha];
      outer[i] = Math.max(0, t); inner[i] = Math.max(0, -t);
    }
    edt(outer, bufferedWidth, bufferedHeight, f, v, z);
    edt(inner, bufferedWidth, bufferedHeight, f, v, z);
    const bitmap = new Uint8Array(length);
    const sdfScale = 255 / RADIUS, base = 255 * (1 - CUTOFF);
    for (let i = 0; i < length; i++) {
      const value = Math.round(base - sdfScale * (Math.sqrt(outer[i]) - Math.sqrt(inner[i])));
      bitmap[i] = value < 0 ? 0 : value > 255 ? 255 : value;
    }
    return { width, height, left, top: top - ascender, advance, bitmap };
  };
}

// Protocol buffer writer for fontnik's glyphs.proto (glyphs > fontstack > glyph).
function varint(out, value) {
  value >>>= 0;
  while (value > 127) { out.push((value & 127) | 128); value >>>= 7; }
  out.push(value);
}
function field(out, number, type) { varint(out, (number << 3) | type); }
function bytesField(out, number, bytes) { field(out, number, 2); varint(out, bytes.length); for (const byte of bytes) out.push(byte); }
function stringField(out, number, text) { bytesField(out, number, Buffer.from(text, 'utf8')); }
function uint32Field(out, number, value) { field(out, number, 0); varint(out, value); }
function sint32Field(out, number, value) { field(out, number, 0); varint(out, (value << 1) ^ (value >> 31)); }
function encodeGlyph(id, glyph) {
  const out = [];
  uint32Field(out, 1, id);
  if (glyph.bitmap) bytesField(out, 2, glyph.bitmap);
  uint32Field(out, 3, glyph.width);
  uint32Field(out, 4, glyph.height);
  sint32Field(out, 5, glyph.left);
  sint32Field(out, 6, glyph.top);
  uint32Field(out, 7, glyph.advance);
  return out;
}
function encodeRange(stack, start, glyphs) {
  const fontstack = [];
  stringField(fontstack, 1, stack);
  stringField(fontstack, 2, `${start}-${start + RANGE - 1}`);
  for (const [id, glyph] of glyphs) bytesField(fontstack, 3, encodeGlyph(id, glyph));
  const out = [];
  bytesField(out, 1, fontstack);
  return Uint8Array.from(out);
}

/** Decode one range back and check the writer against the font's own metrics (fail closed). */
function verifyRange(bytes, font, expected) {
  let index = 0;
  const readVarint = () => { let result = 0, shift = 0; for (;;) { const byte = bytes[index++]; result |= (byte & 127) * 2 ** shift; shift += 7; if (byte < 128) return result; } };
  const glyphs = new Map();
  const readGlyph = (end) => {
    const glyph = {};
    while (index < end) {
      const tag = readVarint();
      const number = tag >>> 3;
      if ((tag & 7) === 2) { const length = readVarint(); if (number === 2) glyph.bitmapLength = length; index += length; }
      else { const value = readVarint(); if (number === 1) glyph.id = value; else if (number === 3) glyph.width = value; else if (number === 4) glyph.height = value; else if (number === 7) glyph.advance = value; }
    }
    glyphs.set(glyph.id, glyph);
  };
  readVarint(); const stackEnd = index + readVarint();
  while (index < stackEnd) {
    const tag = readVarint();
    if ((tag & 7) === 2) { const length = readVarint(); if ((tag >>> 3) === 3) readGlyph(index + length); else index += length; }
    else readVarint();
  }
  for (const [id, glyph] of expected) {
    const decoded = glyphs.get(id);
    const advance = Math.round(font.advance(font.codepoints.get(id)) * FONT_SIZE / font.unitsPerEm);
    if (!decoded || decoded.advance !== advance || (glyph.bitmap && decoded.bitmapLength !== (glyph.width + 2 * BUFFER) * (glyph.height + 2 * BUFFER))) {
      throw new Error(`Glyph U+${id.toString(16)} did not round-trip through the range writer`);
    }
  }
}

async function main() {
  const selected = fonts.filter(font => only.length === 0 || only.includes(font.stack));
  if (selected.length === 0) throw new Error(`No font matches --only ${only.join(',')}`);
  const files = await Promise.all(selected.map(fetchFile));
  const licenceFiles = new Map();
  for (const font of selected) {
    const licence = licences[font.family];
    if (!licence) throw new Error(`${font.family} has no licence record`);
    if (!licenceFiles.has(font.family)) licenceFiles.set(font.family, await fetchFile(licence));
  }
  // A partial run keeps the other stacks' provenance in the receipt.
  let previous = [];
  if (only.length) {
    try { previous = JSON.parse(await readFile(path.join(outDir, 'source.json'), 'utf8')).fonts ?? []; } catch { /* first run */ }
  }
  const receipt = { schemaVersion: 2, generator: 'scripts/buildAtlasGlyphs.mjs',
    method: 'Each glyph outline is read from the pinned TrueType file, rasterized at 24 px with node-canvas and converted to a signed distance field (3 px buffer, radius 8, cutoff 0.25) following fontnik / sdf-glyph-foundry conventions; top is measured from the hhea ascender.',
    rangeSize: RANGE, rangesPerStack: LAST_RANGE / RANGE, fonts: [] };
  for (const [index, font] of selected.entries()) {
    const parsed = parseFont(files[index]);
    const rasterize = createRasterizer(parsed);
    const stackDir = path.join(outDir, font.stack);
    await rm(stackDir, { recursive: true, force: true });
    await mkdir(stackDir, { recursive: true });
    let glyphCount = 0;
    for (let start = 0; start < LAST_RANGE; start += RANGE) {
      const glyphs = [];
      for (let id = start; id < start + RANGE; id++) {
        if (!parsed.codepoints.has(id) || !isRenderable(id)) continue;
        glyphs.push([id, rasterize(parsed.codepoints.get(id))]);
      }
      glyphCount += glyphs.length;
      const encoded = encodeRange(font.stack, start, glyphs);
      if (start === 0) verifyRange(encoded, parsed, glyphs);
      await writeFile(path.join(stackDir, `${start}-${start + RANGE - 1}.pbf`), encoded);
    }
    const licence = licences[font.family];
    receipt.fonts.push({ stack: font.stack, derivedFrom: `${font.family} ${font.style} ${font.version}`, family: font.family, style: font.style, version: font.version,
      source: font.archive ? { archive: font.archive.url, archiveSha256: font.archive.sha256, member: font.member } : { url: font.url },
      sha256: font.sha256, unitsPerEm: parsed.unitsPerEm, ascender: parsed.ascender, glyphCount,
      licence: { name: 'SIL Open Font License 1.1', file: licence.file, reservedFontName: licence.reservedFontName,
        ...(licence.trademark ? { trademark: licence.trademark } : {}) } });
    console.log(`${font.stack}: ${glyphCount} glyphs, ascender ${Math.ceil(parsed.ascender * FONT_SIZE / parsed.unitsPerEm)}px`);
  }
  const regenerated = new Set(receipt.fonts.map(font => font.stack));
  receipt.fonts = [...previous.filter(font => !regenerated.has(font.stack)), ...receipt.fonts]
    .sort((a, b) => fonts.findIndex(f => f.stack === a.stack) - fonts.findIndex(f => f.stack === b.stack));
  for (const [family, bytes] of licenceFiles) await writeFile(path.join(outDir, licences[family].file), bytes);
  await writeFile(path.join(outDir, 'README.txt'), README);
  await writeFile(path.join(outDir, 'source.json'), `${JSON.stringify(receipt, null, 2)}\n`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
