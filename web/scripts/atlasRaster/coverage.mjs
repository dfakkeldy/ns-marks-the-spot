// Tile coverage: the exact set of (z, x, y) addresses that exist, grouped by
// zoom and row, with a run-length JSON form for coverage.json.
//
//   { "zoomRange": [5, 13], "rows": { "<z>": { "<y>": [[xStart, xEnd], ...] } } }
//
// x ranges are inclusive and sorted; every listed address is a rendered tile.

import { metatileIntersectsRange, metatileOrigin, METATILE_TILES } from './tileMath.mjs';

/** Sorted integers to inclusive [start, end] runs. */
export function encodeRuns(values) {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const runs = [];
  for (const value of sorted) {
    const last = runs[runs.length - 1];
    if (last && value === last[1] + 1) last[1] = value;
    else runs.push([value, value]);
  }
  return runs;
}

export function decodeRuns(runs) {
  const values = [];
  for (const run of runs) {
    if (!Array.isArray(run) || run.length !== 2 || !Number.isInteger(run[0]) || !Number.isInteger(run[1]) || run[0] > run[1]) {
      throw new Error(`Coverage run ${JSON.stringify(run)} is not an inclusive [start, end] pair.`);
    }
    for (let x = run[0]; x <= run[1]; x++) values.push(x);
  }
  return values;
}

const numeric = (a, b) => a - b;

export class Coverage {
  constructor() {
    /** @type {Map<number, Map<number, Set<number>>>} zoom -> y -> xs */
    this.zooms = new Map();
  }

  static fromTiles(tiles) {
    const coverage = new Coverage();
    for (const [z, x, y] of tiles) coverage.add(z, x, y);
    return coverage;
  }

  static fromRows(document) {
    const coverage = new Coverage();
    for (const [z, rows] of Object.entries(document.rows ?? {})) {
      for (const [y, runs] of Object.entries(rows)) {
        for (const x of decodeRuns(runs)) coverage.add(Number(z), x, Number(y));
      }
    }
    return coverage;
  }

  add(z, x, y) {
    for (const value of [z, x, y]) {
      if (!Number.isInteger(value) || value < 0) throw new Error(`Tile address ${z}/${x}/${y} is not a whole non-negative address.`);
    }
    let rows = this.zooms.get(z);
    if (!rows) this.zooms.set(z, rows = new Map());
    let xs = rows.get(y);
    if (!xs) rows.set(y, xs = new Set());
    xs.add(x);
  }

  has(z, x, y) {
    return this.zooms.get(z)?.get(y)?.has(x) ?? false;
  }

  zoomLevels() {
    return [...this.zooms.keys()].sort(numeric);
  }

  zoomRange() {
    const levels = this.zoomLevels();
    return levels.length ? [levels[0], levels[levels.length - 1]] : null;
  }

  /** Tiles at one zoom as [x, y], sorted by row then column. */
  *tiles(z) {
    const rows = this.zooms.get(z);
    if (!rows) return;
    for (const y of [...rows.keys()].sort(numeric)) {
      for (const x of [...rows.get(y)].sort(numeric)) yield [x, y];
    }
  }

  countAt(z) {
    let count = 0;
    for (const xs of this.zooms.get(z)?.values() ?? []) count += xs.size;
    return count;
  }

  counts() {
    const counts = {};
    for (const z of this.zoomLevels()) counts[String(z)] = this.countAt(z);
    return counts;
  }

  total() {
    return this.zoomLevels().reduce((sum, z) => sum + this.countAt(z), 0);
  }

  /**
   * Metatiles holding tiles at one zoom, each with the covered addresses in its
   * block, sorted by row then column. `range` keeps only metatiles that overlap
   * an inclusive tile range (used by --bbox).
   */
  metatiles(z, { tiles = METATILE_TILES, range = null } = {}) {
    const blocks = new Map();
    for (const [x, y] of this.tiles(z)) {
      const { mx, my } = metatileOrigin(x, y, tiles);
      if (range && !metatileIntersectsRange(mx, my, range, tiles)) continue;
      const key = `${my}/${mx}`;
      let block = blocks.get(key);
      if (!block) blocks.set(key, block = { z, mx, my, tiles: [] });
      block.tiles.push([x, y]);
    }
    return [...blocks.values()].sort((a, b) => a.my - b.my || a.mx - b.mx);
  }

  toRows() {
    const rows = {};
    for (const z of this.zoomLevels()) {
      const level = {};
      const byRow = this.zooms.get(z);
      for (const y of [...byRow.keys()].sort(numeric)) level[String(y)] = encodeRuns([...byRow.get(y)]);
      rows[String(z)] = level;
    }
    return { zoomRange: this.zoomRange(), rows };
  }
}
