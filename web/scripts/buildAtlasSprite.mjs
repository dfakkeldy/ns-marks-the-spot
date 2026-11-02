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
//   hand-peak-N / hand-mesa-N        little inked mountains, pointed or flat-topped,
//                                    placed on DEM uplands (three variants each)
//   hand-town / hand-house           a ringed town mark and a little cottage
//   hand-ink[-water]                 the hand-inked stroke in sepia
//   hand-road-edges                  the two freehand edges of a double-line street
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
  const waves = [[3, 4, 0.25], [4, 5, 0.2], [5, 3, 0.2], [7, 6, 0.12]]
    .map(wave => [...wave, phases() * Math.PI * 2, phases() * Math.PI * 2]);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let value = 0;
      for (const [fx, fy, amplitude, px, py] of waves) {
        value += amplitude * Math.sin((x / size) * fx * Math.PI * 2 + px) * Math.cos((y / size) * fy * Math.PI * 2 + py);
      }
      // Only fine mottle: a tile with no broad structure shows no repeat.
      const cloud = value / 0.77;
      const grain = rand() - 0.5;
      const fleck = rand() < 0.008 / scale ? 0.35 : 0;
      let alpha = cloud * 0.05 + grain * 0.11 + fleck;
      const [r, g, b] = alpha < 0 ? [255, 248, 228] : [92, 58, 24];
      alpha = Math.min(0.16, Math.abs(alpha));
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

/**
 * Lines a*x + b*y = c with integer a and b repeat on a square tile when c steps by
 * size/n, so a family of them tiles seamlessly at a slope other than 45 degrees.
 * Each line is seeded by its index modulo n, so wrapped copies match exactly.
 */
function hatchFamily(context, size, [a, b], n, { seed, width, alpha, wobble, lift }) {
  const span = Math.abs(a) + Math.abs(b);
  for (let k = -span * n; k <= span * n; k++) {
    const rand = random(seed + (((k % n) + n) % n));
    const c = (k + (rand() - 0.5) * 0.6) * size / n;
    // Endpoints where the line crosses y = 0 and y = size (b is never zero here).
    const x0 = c / a, x1 = (c - b * size) / a;
    if (Math.max(x0, x1) < -size || Math.min(x0, x1) > 2 * size) continue;
    context.lineWidth = width[0] + rand() * width[1];
    context.globalAlpha = alpha[0] + rand() * alpha[1];
    if (rand() < lift) {
      // A pen lift: the stroke breaks for a few pixels somewhere along its length.
      const t = 0.2 + rand() * 0.6, gap = (0.04 + rand() * 0.05);
      penLine(context, rand, x0, 0, x0 + (x1 - x0) * t, size * t, wobble);
      penLine(context, rand, x0 + (x1 - x0) * (t + gap), size * (t + gap), x1, size, wobble);
    } else penLine(context, rand, x0, 0, x1, size, wobble);
  }
}

/** A shallow main hatch crossed, more faintly, at 45 degrees to it: engraved water, not a mesh. */
function handSea(scale) {
  const size = 64 * scale;
  const canvas = createCanvas(size, size);
  const context = canvas.getContext('2d');
  context.strokeStyle = SEPIA;
  context.lineCap = 'round';
  hatchFamily(context, size, [1, -2], 10, { seed: 1606, width: [0.35 * scale, 0.2 * scale], alpha: [0.18, 0.08], wobble: 1.4 * scale, lift: 0.15 });
  hatchFamily(context, size, [3, -1], 3, { seed: 1607, width: [0.35 * scale, 0], alpha: [0.07, 0.03], wobble: 1.2 * scale, lift: 0.4 });
  return canvas;
}

/** A scrawled asterisk: one overshooting near-vertical stem and three shorter arms. */
function asterisk(context, rand, x, y, radius) {
  const stem = Math.PI / 2 + (rand() - 0.5) * 0.4;
  penLine(context, rand, x - Math.cos(stem) * radius * 1.4, y - Math.sin(stem) * radius * 1.4,
    x + Math.cos(stem) * radius * 1.4, y + Math.sin(stem) * radius * 1.4, radius * 0.12);
  for (let i = 1; i <= 3; i++) {
    const angle = stem + (i / 4) * Math.PI + (rand() - 0.5) * 0.8;
    const r = radius * (0.75 + rand() * 0.35);
    penLine(context, rand, x - Math.cos(angle) * r, y - Math.sin(angle) * r, x + Math.cos(angle) * r, y + Math.sin(angle) * r, radius * 0.15);
  }
}

/** A few bold scrawled asterisks, off any obvious lattice, as on the reference charts. */
function handTreesFar(scale) {
  const size = 160 * scale;
  const canvas = createCanvas(size, size);
  const context = canvas.getContext('2d');
  const rand = random(1749);
  context.strokeStyle = '#2a1a0c';
  context.lineCap = 'round';
  const spots = [[0.22, 0.3, true], [0.71, 0.58, true], [0.38, 0.86, false], [0.86, 0.12, false]];
  for (const [u, v, big] of spots) {
    const radius = (big ? 7 + rand() * 2 : 4 + rand()) * scale;
    const width = (big ? 1.6 + rand() * 0.3 : 1.1) * scale;
    const seed = Math.round(u * 1000 + v * 77);
    wrapped(size, u * size, v * size, radius * 2, (cx, cy) => {
      context.lineWidth = width;
      context.globalAlpha = big ? 0.85 : 0.5;
      asterisk(context, random(seed), cx, cy, radius);
    });
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

/** A seamless forest: trees in loose clumps with glades, sized mostly small, never in rows. */
function handTrees(scale) {
  const size = 256 * scale;
  const canvas = createCanvas(size, size);
  const context = canvas.getContext('2d');
  const rand = random(1867);
  context.strokeStyle = SEPIA;
  context.fillStyle = 'rgba(122, 104, 52, 0.18)';
  context.lineJoin = 'round';
  context.lineCap = 'round';
  const wrappedDistance = (a, b) => {
    const dx = Math.min(Math.abs(a[0] - b[0]), size - Math.abs(a[0] - b[0]));
    const dy = Math.min(Math.abs(a[1] - b[1]), size - Math.abs(a[1] - b[1]));
    return Math.hypot(dx, dy);
  };
  const clumps = [[0.2, 0.25], [0.68, 0.2], [0.35, 0.7], [0.82, 0.72]].map(([u, v]) => [u * size, v * size]);
  const glades = [[0.55, 0.47], [0.05, 0.52]].map(([u, v]) => [u * size, v * size]);
  const placed = [];
  for (let attempt = 0; attempt < 4000 && placed.length < 34; attempt++) {
    const clump = clumps[Math.floor(rand() * clumps.length)];
    const spread = 58 * scale;
    const point = [(clump[0] + (rand() - 0.5) * 2 * spread + size) % size, (clump[1] + (rand() - 0.5) * 2 * spread + size) % size];
    if (glades.some(glade => wrappedDistance(point, glade) < 22 * scale)) continue;
    if (placed.some(other => wrappedDistance(point, other) < 17 * scale)) continue;
    placed.push(point);
  }
  for (const [index, [x, y]] of placed.entries()) {
    const height = (9 + rand() ** 2 * 9) * scale;
    const kind = rand() < 0.7 ? pine : roundTree;
    const mirror = rand() < 0.5 ? -1 : 1, tilt = (rand() - 0.5) * 0.14;
    const width = (0.8 + rand() * 0.3) * scale, alpha = 0.6 + rand() * 0.25;
    wrapped(size, x, y, height * 1.2, (cx, cy) => {
      context.save();
      context.translate(cx, cy); context.rotate(tilt); context.scale(mirror, 1);
      context.lineWidth = width; context.globalAlpha = alpha;
      kind(context, random(1900 + index), 0, 0, height);
      context.restore();
    });
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

/**
 * A little mountain as the old charts drew them: a quick inked ridge, steeper on the
 * left, with a comb of shading strokes falling from the right-hand flank. `flat` gives
 * the crest a short level top, for Nova Scotia's tableland highlands.
 */
function handMountain(scale, seed, { flat, shoulder }) {
  const width = 36 * scale, height = 24 * scale;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  const rand = random(seed);
  context.strokeStyle = SEPIA;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  const base = height - 2.5 * scale;
  const ridge = (left, right, top, alpha, weight) => {
    const span = right - left;
    const crest = flat ? span * (0.22 + rand() * 0.1) : 0;
    const peak = left + span * (0.38 + rand() * 0.1);
    const [crestLeft, crestRight] = [peak - crest / 2, peak + crest / 2];
    context.globalAlpha = alpha;
    context.lineWidth = weight * scale;
    penLine(context, rand, left, base, crestLeft, top, 0.7 * scale);
    if (flat) penLine(context, rand, crestLeft, top, crestRight, top + (rand() - 0.5) * scale, 0.5 * scale);
    penLine(context, rand, crestRight, top, right, base, 0.7 * scale);
    // Shading: strokes from the right flank down toward the foot, longer near the crest.
    context.lineWidth = weight * 0.62 * scale;
    const strokes = 4 + Math.floor(rand() * 3);
    for (let i = 1; i <= strokes; i++) {
      const t = i / (strokes + 1);
      const x = crestRight + (right - crestRight) * t, y = top + (base - top) * t;
      const length = (base - y) * (0.75 + rand() * 0.2);
      penLine(context, rand, x - 0.6 * scale, y + 1.2 * scale, x - length * 0.45, y + length, 0.35 * scale);
    }
  };
  // Some marks carry a lower shoulder behind, as ranges do.
  if (shoulder) ridge(width * 0.42, width - 1.5 * scale, height * 0.42, 0.6, 1.1);
  ridge(1.5 * scale, width * (0.68 + rand() * 0.1), 2.5 * scale + rand() * 2 * scale, 0.92, 1.5);
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

/**
 * A double-line street drawn freehand: two wobbling pen edges with an open middle,
 * laid over the road fill so the paper shows through. Periodic so the tile repeats.
 */
function handRoadEdges(scale) {
  const width = 128 * scale, height = 12 * scale;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  const rand = random(1791);
  context.fillStyle = SEPIA;
  for (const edge of [0, 1]) {
    const points = 10, wander = [], weight = [];
    for (let i = 0; i < points; i++) { wander.push((rand() - 0.5) * 0.9); weight.push(0.9 + rand() * 0.7); }
    const at = (t, values) => {
      const i = Math.floor(t) % points, next = (i + 1) % points, frac = t - Math.floor(t);
      return values[i] * (1 - frac) + values[next] * frac;
    };
    const centre = (s) => (edge ? height - 1.6 * scale : 1.6 * scale) + at(s * points, wander) * scale;
    context.beginPath();
    for (let x = 0; x <= width; x++) { const y = centre(x / width) - at((x / width) * points, weight) * scale / 2; x ? context.lineTo(x, y) : context.moveTo(x, y); }
    for (let x = width; x >= 0; x--) context.lineTo(x, centre(x / width) + at((x / width) * points, weight) * scale / 2);
    context.closePath();
    context.fill();
  }
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
    ...[0, 1, 2].flatMap(variant => [
      [`hand-peak-${variant}`, handMountain(scale, 1700 + variant, { flat: false, shoulder: variant > 0 })],
      [`hand-mesa-${variant}`, handMountain(scale, 1700 + variant, { flat: true, shoulder: variant > 0 })],
    ]),
    ['hand-town', handTown(scale)],
    ['hand-house', handHouse(scale)],
    ['hand-ink', inkLine(scale, '#3b2614')],
    ['hand-ink-water', inkLine(scale, '#6b4a2a')],
    ['hand-road-edges', handRoadEdges(scale)],
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
sea hatching, tree doodles, little mountains, cottages) for the Hand-drawn style. Regenerate with
\`node scripts/buildAtlasSprite.mjs\`. Project-generated cartography; no source
imagery is embedded.
`);
console.log(`wrote sprite to ${outDir}`);
