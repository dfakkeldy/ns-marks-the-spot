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
for the Fletcher-inspired Atlas basemap. Regenerate with
\`node scripts/buildAtlasSprite.mjs\`. Project-generated cartography; no source
imagery is embedded.
`);
console.log(`wrote sprite to ${outDir}`);
