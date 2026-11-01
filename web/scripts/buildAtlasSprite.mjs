#!/usr/bin/env node
// Generate the Atlas sprite: the textures that give the Fletcher-inspired
// basemap its printed-on-paper and hand-inked character without any hatching.
//
//   paper-grain / paper-grain-night  seamless, mostly transparent paper mottle and
//                                    speckle, drawn above fills and lines but
//                                    below lettering
//   shore-stipple                    engraved-style dots inside the shore
//   ink-line[-water|-road][-night]   hand-inked strokes of varying weight for the
//                                    coastline, brooks and road casings
//
// The Hand-drawn style adds a sketchbook set in sepia ink (all prefixed hand-):
//   hand-paper                       parchment mottle, stains and fibres
//   hand-sea                         loose pen cross-hatching for open water
//   hand-trees-far / hand-trees      ink asterisks for forest at regional scale,
//                                    then doodled pines and round trees up close
//   hand-marsh / hand-field          grass tufts for wetland, furrows for farmland
//   hand-mountain / hand-hill        hachured ridges placed on named heights
//   hand-town / hand-house           a ringed town mark and a little cottage
//   hand-ink[-water|-road]           the hand-inked stroke in sepia
//
// Everything is procedural from a fixed seed, so `node scripts/buildAtlasSprite.mjs`
// reproduces public/atlas/sprite byte-for-byte on the same canvas build.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from 'canvas';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '..', process.argv[2] ?? 'public/atlas/sprite');

/** Deterministic PRNG (mulberry32) so the sprite is reproducible. */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paperGrain(size, scale, { night }) {
  const canvas = createCanvas(size, size);
  const context = canvas.getContext('2d');
  const image = context.createImageData(size, size);
  const rand = random(night ? 1884 : 19);
  const phases = random(7);
  const harmonic = [];
  for (let i = 0; i < 5; i++) harmonic.push(phases() * Math.PI * 2);
  const [dark, light] = night ? [[0, 0, 0], [232, 224, 200]] : [[58, 46, 26], [255, 252, 240]];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let value = 0;
      for (const [index, [fx, fy, amplitude]] of [[1, 2, 1], [2, 1, 0.8], [3, 3, 0.55], [2, 5, 0.35], [5, 2, 0.3]].entries()) {
        value += amplitude * Math.sin((x / size) * fx * Math.PI * 2 + harmonic[index]) * Math.cos((y / size) * fy * Math.PI * 2 + harmonic[index] * 0.7);
      }
      const cloud = value / 3; // -1..1, seamless
      const grain = rand() - 0.5; // fine speckle
      const fibre = rand() < 0.012 / scale ? (rand() - 0.5) * 2 : 0; // sparse stronger flecks
      let alpha = cloud * (night ? 0.04 : 0.065) + grain * (night ? 0.055 : 0.085) + fibre * 0.14;
      const [r, g, b] = alpha < 0 ? light : dark;
      alpha = Math.min(0.2, Math.abs(alpha));
      const offset = (y * size + x) * 4;
      image.data[offset] = r; image.data[offset + 1] = g; image.data[offset + 2] = b;
      image.data[offset + 3] = Math.round(alpha * 255);
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function shoreStipple(scale) {
  const width = 32 * scale, height = 10 * scale;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  const rand = random(45);
  context.fillStyle = 'rgba(42, 36, 24, 1)';
  // Rows of dots that thin out from the shore side (top) into the water.
  for (let row = 0; row < 4; row++) {
    const count = [7, 5, 3, 1][row];
    for (let i = 0; i < count; i++) {
      const cx = (i + 0.5 + rand() * 0.6 - 0.3) * (width / count);
      const cy = (row + 0.5 + rand() * 0.5 - 0.25) * (height / 4.5);
      const radius = (0.55 + rand() * 0.25) * scale * (1 - row * 0.12);
      context.globalAlpha = 0.85 - row * 0.15;
      context.beginPath(); context.arc(cx, cy, radius, 0, Math.PI * 2); context.fill();
    }
  }
  return canvas;
}

function inkLine(scale, colour) {
  const width = 96 * scale, height = 8 * scale;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  const rand = random(63);
  context.fillStyle = colour;
  // A pen stroke whose centre wanders and whose weight swells, periodic so the tile repeats.
  const points = 12;
  const centre = [], weight = [];
  for (let i = 0; i < points; i++) { centre.push((rand() - 0.5) * 0.28); weight.push(0.42 + rand() * 0.3); }
  context.beginPath();
  const at = (i, side) => {
    const t = ((i % points) + points) % points;
    const next = (t + 1) % points;
    const frac = (i - Math.floor(i));
    const c = centre[t] * (1 - frac) + centre[next] * frac;
    const w = weight[t] * (1 - frac) + weight[next] * frac;
    return (0.5 + c + side * w / 2) * height;
  };
  const steps = width;
  for (let s = 0; s <= steps; s++) { const x = (s / steps) * width; const y = at((s / steps) * points, -1); s === 0 ? context.moveTo(x, y) : context.lineTo(x, y); }
  for (let s = steps; s >= 0; s--) { const x = (s / steps) * width; context.lineTo(x, at((s / steps) * points, 1)); }
  context.closePath();
  context.fill();
  return canvas;
}

// ---- Hand-drawn set -------------------------------------------------------

const SEPIA = '#3b2614';

/** Draw a mark at every wrapped copy that touches the tile, so patterns repeat seamlessly. */
function wrapped(size, x, y, reach, draw) {
  for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
    const cx = x + dx, cy = y + dy;
    if (cx > -reach && cx < size + reach && cy > -reach && cy < size + reach) draw(cx, cy);
  }
}

/** A pen line that wobbles a little along its length. */
function penLine(context, rand, x0, y0, x1, y1, wobble) {
  const steps = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 6));
  const nx = -(y1 - y0), ny = x1 - x0, length = Math.hypot(nx, ny) || 1;
  context.beginPath();
  context.moveTo(x0, y0);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, w = i === steps ? 0 : (rand() - 0.5) * wobble;
    context.lineTo(x0 + (x1 - x0) * t + nx / length * w, y0 + (y1 - y0) * t + ny / length * w);
  }
  context.stroke();
}

function handPaper(size, scale) {
  const canvas = createCanvas(size, size);
  const context = canvas.getContext('2d');
  const image = context.createImageData(size, size);
  const rand = random(1720);
  const phases = random(33);
  const waves = [[1, 1, 1], [1, 2, 0.8], [2, 1, 0.7], [3, 2, 0.45], [2, 3, 0.4], [4, 5, 0.2], [5, 3, 0.2]]
    .map(wave => [...wave, phases() * Math.PI * 2, phases() * Math.PI * 2]);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let value = 0;
      for (const [fx, fy, amplitude, px, py] of waves) {
        value += amplitude * Math.sin((x / size) * fx * Math.PI * 2 + px) * Math.cos((y / size) * fy * Math.PI * 2 + py);
      }
      const cloud = value / 3.75;                       // broad, seamless tea stains
      const stain = Math.max(0, Math.abs(cloud) - 0.45) * 0.9; // darker blotch rims
      const grain = rand() - 0.5;
      const fleck = rand() < 0.008 / scale ? 0.35 : 0;
      let alpha = cloud * 0.11 + stain + grain * 0.09 + fleck;
      const [r, g, b] = alpha < 0 ? [255, 248, 228] : [92, 58, 24];
      alpha = Math.min(0.3, Math.abs(alpha));
      const offset = (y * size + x) * 4;
      image.data[offset] = r; image.data[offset + 1] = g; image.data[offset + 2] = b;
      image.data[offset + 3] = Math.round(alpha * 255);
    }
  }
  context.putImageData(image, 0, 0);
  // A few long paper fibres.
  context.strokeStyle = 'rgba(92, 58, 24, 0.16)';
  context.lineWidth = 0.6 * scale;
  for (let i = 0; i < 9; i++) {
    const x = rand() * size, y = rand() * size, angle = rand() * Math.PI, length = (6 + rand() * 14) * scale;
    wrapped(size, x, y, length, (cx, cy) => penLine(context, rand, cx, cy, cx + Math.cos(angle) * length, cy + Math.sin(angle) * length, 1.5 * scale));
  }
  return canvas;
}

/** Two families of loose diagonal pen strokes; the spacing divides the tile so it repeats. */
function handSea(scale) {
  const size = 48 * scale;
  const canvas = createCanvas(size, size);
  const context = canvas.getContext('2d');
  const rand = random(1606);
  context.strokeStyle = SEPIA;
  context.lineCap = 'round';
  for (const [family, alpha] of [[1, 0.3], [-1, 0.2]]) {
    const gap = size / 6;
    for (let i = -6; i < 12; i++) {
      context.globalAlpha = alpha * (0.75 + rand() * 0.5);
      context.lineWidth = (0.45 + rand() * 0.3) * scale;
      const start = i * gap + (rand() - 0.5) * gap * 0.25;
      // A 45-degree line through the tile; drawn long so every wrap is covered.
      const x0 = family > 0 ? start : start + size, x1 = family > 0 ? start + size : start;
      penLine(context, rand, x0, 0, x1, size, 1.2 * scale);
    }
  }
  return canvas;
}

function asterisk(context, rand, x, y, radius) {
  const arms = 3 + Math.floor(rand() * 2);
  const turn = rand() * Math.PI;
  for (let i = 0; i < arms; i++) {
    const angle = turn + (i / arms) * Math.PI + (rand() - 0.5) * 0.3;
    const r = radius * (0.8 + rand() * 0.4);
    penLine(context, rand, x - Math.cos(angle) * r, y - Math.sin(angle) * r, x + Math.cos(angle) * r, y + Math.sin(angle) * r, radius * 0.15);
  }
}

function handTreesFar(scale) {
  const size = 72 * scale;
  const canvas = createCanvas(size, size);
  const context = canvas.getContext('2d');
  const rand = random(1749);
  context.strokeStyle = SEPIA;
  context.lineCap = 'round';
  const spots = [[0.2, 0.25], [0.7, 0.15], [0.45, 0.62], [0.9, 0.7], [0.12, 0.85]];
  for (const [u, v] of spots) {
    context.globalAlpha = 0.5 + rand() * 0.25;
    context.lineWidth = (0.9 + rand() * 0.4) * scale;
    const radius = (3.2 + rand() * 1.3) * scale;
    const x = (u + (rand() - 0.5) * 0.08) * size, y = (v + (rand() - 0.5) * 0.08) * size;
    wrapped(size, x, y, radius * 2, (cx, cy) => asterisk(context, random(Math.round(u * 1000 + v * 77)), cx, cy, radius));
  }
  return canvas;
}

function pine(context, rand, x, y, height) {
  const half = height * (0.28 + rand() * 0.08);
  context.beginPath();
  // Zig-zag boughs down from the tip, then the trunk.
  const tiers = 3;
  context.moveTo(x, y - height);
  for (let i = 1; i <= tiers; i++) {
    const ty = y - height + (height * 0.82) * (i / tiers);
    const w = half * (i / tiers) * (0.9 + rand() * 0.2);
    context.lineTo(x - w, ty);
    if (i < tiers) context.lineTo(x - w * 0.35, ty - height * 0.05);
  }
  context.lineTo(x + half * (0.95 + rand() * 0.1), y - height * 0.18);
  for (let i = tiers - 1; i >= 1; i--) {
    const ty = y - height + (height * 0.82) * (i / tiers);
    const w = half * (i / tiers);
    context.lineTo(x + w * 0.35, ty + height * 0.03);
    context.lineTo(x + w, ty);
  }
  context.closePath();
  context.fill();
  context.stroke();
  penLine(context, rand, x, y - height * 0.18, x + (rand() - 0.5), y, 0.5);
}

function roundTree(context, rand, x, y, height) {
  const radius = height * 0.3;
  const cy = y - height + radius;
  context.beginPath();
  // A scalloped crown drawn as one wobbly loop.
  for (let i = 0; i <= 14; i++) {
    const angle = (i / 14) * Math.PI * 2;
    const r = radius * (1 + (i % 2 ? 0.12 : -0.04) + (rand() - 0.5) * 0.1);
    const px = x + Math.cos(angle) * r, py = cy + Math.sin(angle) * r * 0.95;
    i === 0 ? context.moveTo(px, py) : context.lineTo(px, py);
  }
  context.closePath();
  context.fill();
  context.stroke();
  penLine(context, rand, x, cy + radius * 0.9, x, y, 0.4);
}

function handTrees(scale) {
  const size = 96 * scale;
  const canvas = createCanvas(size, size);
  const context = canvas.getContext('2d');
  const rand = random(1867);
  context.strokeStyle = SEPIA;
  context.fillStyle = 'rgba(122, 104, 52, 0.28)';
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.lineWidth = 0.95 * scale;
  context.globalAlpha = 0.78;
  // Loosely staggered rows so the forest reads as a stand, not a grid.
  const spots = [[0.15, 0.3, 'pine'], [0.48, 0.22, 'round'], [0.8, 0.34, 'pine'], [0.3, 0.68, 'pine'],
    [0.62, 0.62, 'pine'], [0.92, 0.82, 'round'], [0.05, 0.95, 'pine']];
  for (const [u, v, kind] of spots) {
    const height = (13 + rand() * 4) * scale;
    const x = (u + (rand() - 0.5) * 0.05) * size, y = (v + (rand() - 0.5) * 0.05) * size;
    const seed = Math.round(u * 997 + v * 131);
    wrapped(size, x, y, height * 1.2, (cx, cy) => (kind === 'pine' ? pine : roundTree)(context, random(seed), cx, cy, height));
  }
  return canvas;
}

function handMarsh(scale) {
  const size = 40 * scale;
  const canvas = createCanvas(size, size);
  const context = canvas.getContext('2d');
  const rand = random(1755);
  context.strokeStyle = SEPIA;
  context.lineCap = 'round';
  context.lineWidth = 0.8 * scale;
  context.globalAlpha = 0.6;
  for (const [u, v] of [[0.25, 0.3], [0.75, 0.55], [0.35, 0.88]]) {
    const x = u * size, y = v * size, w = 5 * scale;
    wrapped(size, x, y, w * 2, (cx, cy) => {
      penLine(context, rand, cx - w, cy, cx + w, cy, 0.3 * scale);
      for (const lean of [-0.6, 0, 0.6]) penLine(context, rand, cx + lean * w * 0.5, cy, cx + lean * w * 0.9, cy - w * (lean ? 0.75 : 1), 0.2 * scale);
    });
  }
  return canvas;
}

function handField(scale) {
  const size = 24 * scale;
  const canvas = createCanvas(size, size);
  const context = canvas.getContext('2d');
  const rand = random(1812);
  context.strokeStyle = SEPIA;
  context.lineCap = 'round';
  context.lineWidth = 0.6 * scale;
  context.globalAlpha = 0.28;
  // Furrows: short dashes in rows, staggered every other row.
  for (let row = 0; row < 3; row++) {
    const y = (row + 0.5) * size / 3;
    for (let i = 0; i < 2; i++) {
      const x = ((i + (row % 2) * 0.5) / 2) * size;
      wrapped(size, x, y, size / 3, (cx, cy) => penLine(context, rand, cx, cy, cx + size * 0.28, cy, 0.4 * scale));
    }
  }
  return canvas;
}

/** A ridge drawn as a peaked line with hachure strokes falling away on the shaded side. */
function handMountain(scale, { width, height, peaks }) {
  const canvas = createCanvas(width * scale, height * scale);
  const context = canvas.getContext('2d');
  const rand = random(width * 13 + peaks);
  context.strokeStyle = SEPIA;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  const base = (height - 2) * scale;
  const ridge = [];
  for (let p = 0; p < peaks; p++) {
    const left = (2 + (p / peaks) * (width - 4)) * scale, right = (2 + ((p + 1) / peaks) * (width - 4)) * scale;
    const top = (2 + (p % 2) * height * 0.22 + rand() * 2) * scale;
    ridge.push([left, base - (p ? height * 0.3 * scale : 0)], [(left + right) / 2 + (rand() - 0.5) * 2 * scale, top]);
  }
  ridge.push([(width - 2) * scale, base]);
  context.lineWidth = 1.5 * scale;
  context.beginPath();
  ridge.forEach(([x, y], index) => (index ? context.lineTo(x, y) : context.moveTo(x, y)));
  context.stroke();
  // Hachures down the right-hand (shaded) flank of each peak.
  context.lineWidth = 0.9 * scale;
  for (let i = 1; i < ridge.length - 1; i += 2) {
    const [px, py] = ridge[i], [qx, qy] = ridge[i + 1];
    for (let k = 1; k <= 4; k++) {
      const t = k / 5;
      const x = px + (qx - px) * t, y = py + (qy - py) * t;
      penLine(context, rand, x, y + 1 * scale, x - 2.5 * scale, y + (base - y) * 0.75, 0.6 * scale);
    }
  }
  return canvas;
}

function handTown(scale) {
  const size = 14 * scale;
  const canvas = createCanvas(size, size);
  const context = canvas.getContext('2d');
  const rand = random(1604);
  context.strokeStyle = SEPIA;
  context.fillStyle = SEPIA;
  context.lineWidth = 1.2 * scale;
  context.beginPath();
  for (let i = 0; i <= 18; i++) {
    const angle = (i / 18) * Math.PI * 2.08; // overshoot, as a pen circle does
    const r = size * 0.38 * (1 + (rand() - 0.5) * 0.08);
    const x = size / 2 + Math.cos(angle) * r, y = size / 2 + Math.sin(angle) * r;
    i ? context.lineTo(x, y) : context.moveTo(x, y);
  }
  context.stroke();
  context.beginPath(); context.arc(size / 2, size / 2, 1.7 * scale, 0, Math.PI * 2); context.fill();
  return canvas;
}

function handHouse(scale) {
  const width = 14 * scale, height = 14 * scale;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  const u = scale;
  context.strokeStyle = SEPIA;
  context.lineWidth = 1.1 * u;
  context.lineJoin = 'round';
  context.fillStyle = '#f1e4c2';
  context.beginPath();
  context.moveTo(2.5 * u, 6.5 * u); context.lineTo(7 * u, 2 * u); context.lineTo(11.5 * u, 6.5 * u);
  context.lineTo(11 * u, 12.5 * u); context.lineTo(3 * u, 12.5 * u); context.closePath();
  context.fill(); context.stroke();
  context.fillStyle = SEPIA;
  context.fillRect(6 * u, 9 * u, 2 * u, 3.5 * u);  // door
  context.fillRect(9 * u, 3 * u, 1.4 * u, 2.4 * u); // chimney
  return canvas;
}

async function build(scale) {
  const images = [
    ['paper-grain', paperGrain(256 * scale, scale, { night: false })],
    ['paper-grain-night', paperGrain(256 * scale, scale, { night: true })],
    ['shore-stipple', shoreStipple(scale)],
    // Stroke colours mirror src/atlas/palette.ts (ink, waterLine, roadEdge) for each mode.
    ['ink-line', inkLine(scale, '#2a2418')],
    ['ink-line-night', inkLine(scale, '#ece3c8')],
    ['ink-line-water', inkLine(scale, '#4f7d88')],
    ['ink-line-water-night', inkLine(scale, '#4f7a84')],
    ['ink-line-road', inkLine(scale, '#5e4d33')],
    ['ink-line-road-night', inkLine(scale, '#121410')],
    // The Hand-drawn style; stroke colours mirror atlasPalettes.handdrawn.
    ['hand-paper', handPaper(256 * scale, scale)],
    ['hand-sea', handSea(scale)],
    ['hand-trees-far', handTreesFar(scale)],
    ['hand-trees', handTrees(scale)],
    ['hand-marsh', handMarsh(scale)],
    ['hand-field', handField(scale)],
    ['hand-mountain', handMountain(scale, { width: 30, height: 18, peaks: 2 })],
    ['hand-hill', handMountain(scale, { width: 18, height: 12, peaks: 1 })],
    ['hand-town', handTown(scale)],
    ['hand-house', handHouse(scale)],
    ['hand-ink', inkLine(scale, '#3b2614')],
    ['hand-ink-water', inkLine(scale, '#5a3d22')],
    ['hand-ink-road', inkLine(scale, '#4a3018')],
  ];
  const width = Math.max(...images.map(([, canvas]) => canvas.width));
  const height = images.reduce((sum, [, canvas]) => sum + canvas.height, 0);
  const sheet = createCanvas(width, height);
  const context = sheet.getContext('2d');
  const index = {};
  let y = 0;
  for (const [id, canvas] of images) {
    context.drawImage(canvas, 0, y);
    index[id] = { x: 0, y, width: canvas.width, height: canvas.height, pixelRatio: scale };
    y += canvas.height;
  }
  const suffix = scale === 1 ? '' : `@${scale}x`;
  await writeFile(path.join(outDir, `sprite${suffix}.png`), sheet.toBuffer('image/png'));
  await writeFile(path.join(outDir, `sprite${suffix}.json`), `${JSON.stringify(index, null, 2)}\n`);
}

await mkdir(outDir, { recursive: true });
await build(1);
await build(2);
await writeFile(path.join(outDir, 'README.txt'), `NS Marks Atlas sprite

Procedurally generated textures (paper grain, shore stipple, hand-inked stroke)
for the Fletcher-inspired Atlas basemap, and the sepia sketchbook set (parchment,
sea hatching, tree doodles, hachured hills, cottages) for the Hand-drawn style. Regenerate with
\`node scripts/buildAtlasSprite.mjs\`. Project-generated cartography; no source
imagery is embedded.
`);
console.log(`wrote sprite to ${outDir}`);
