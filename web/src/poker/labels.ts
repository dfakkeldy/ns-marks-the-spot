/**
 * Screen-space label placement for Poker. Road names lie along straight runs of
 * their road; civic numbers try eight positions around their dot. A label that
 * finds no clear space is left off for this view rather than drawn over another
 * one. Dots always draw, above every label, so a missing number never hides
 * that a point exists.
 */
import { latLngBounds, type LatLngBounds } from 'leaflet';
import { roadRank } from './cartography';
export type ScreenPoint = { x: number; y: number };
/** An oriented rectangle: centre, half-extents along its own axes, rotation in radians. */
export type LabelBox = { cx: number; cy: number; hw: number; hh: number; angle: number };
export type Rect = { left: number; top: number; right: number; bottom: number };
export type PointLabel = {
  key: string; x: number; y: number; width: number; height: number;
  /** Radius of what is drawn at the point; the label keeps clear of it. */
  clearance: number;
  /** The chosen address: placed before everything else. */
  selected?: boolean;
};
export type RoadLabel = {
  key: string; width: number; height: number;
  /** 0 highways, 1 ordinary roads, 2 tracks, trails and closed roads. */
  rank: 0 | 1 | 2;
  /** Whole connected runs of the road in container pixels, not clipped to the view. */
  lines: ScreenPoint[][];
};
export type PlacedPoint = { kind: 'point'; key: string; dx: number; dy: number };
/** Centre in container pixels; angle in degrees, always upright. */
export type PlacedRoad = { kind: 'road'; key: string; index: number; x: number; y: number; angle: number };
export type LabelLayout = {
  width: number; height: number;
  points: PointLabel[]; roads: RoadLabel[];
  /** Map controls drawn over the map; a label under one could not be read. */
  obstacles?: Rect[];
  /** At the closest zoom a number with no clear space is shown anyway, so every address stays readable somewhere. */
  showAllPoints?: boolean;
};

const DOT_RADIUS = 3, GAP = 2, POINT_PAD = 1, ROAD_PAD = 2, EDGE = 2;
/** Road labels repeat along a long road at about this spacing, and never closer than REPEAT_GAP. */
const ROAD_SPACING = 400, REPEAT_GAP = 240, ROAD_STEP = 12;
const DIAGONAL = Math.SQRT1_2;
// Above first, as Poker always drew them; then beside, below and the corners.
const ANCHORS: readonly [number, number][] = [[0, -1], [1, 0], [-1, 0], [0, 1], [1, -1], [-1, -1], [1, 1], [-1, 1]];

/**
 * What a collision box stands for. A number ignores the dots at its own spot. A
 * road name may pass over another address's dot when nothing else fits, because
 * dots draw above labels; the chosen address's ring it may not cover.
 */
type Kind = 'label' | 'dot' | 'ring';
type Entry = LabelBox & { cos: number; sin: number; minX: number; minY: number; maxX: number; maxY: number; stamp: number; kind: Kind };

function entry(box: LabelBox, kind: Kind = 'label'): Entry {
  const cos = Math.cos(box.angle), sin = Math.sin(box.angle);
  const ex = box.hw * Math.abs(cos) + box.hh * Math.abs(sin), ey = box.hw * Math.abs(sin) + box.hh * Math.abs(cos);
  return { ...box, cos, sin, minX: box.cx - ex, minY: box.cy - ey, maxX: box.cx + ex, maxY: box.cy + ey, stamp: 0, kind };
}

function radius(box: Entry, ax: number, ay: number): number {
  return box.hw * Math.abs(box.cos * ax + box.sin * ay) + box.hh * Math.abs(box.cos * ay - box.sin * ax);
}

function entriesOverlap(a: Entry, b: Entry): boolean {
  if (a.maxX <= b.minX || b.maxX <= a.minX || a.maxY <= b.minY || b.maxY <= a.minY) return false;
  if (a.angle === 0 && b.angle === 0) return true;
  // Separating axis test on both rectangles' edge normals; touching is not overlapping.
  for (const box of [a, b]) for (const [ax, ay] of [[box.cos, box.sin], [-box.sin, box.cos]]) {
    if (Math.abs((b.cx - a.cx) * ax + (b.cy - a.cy) * ay) >= radius(a, ax, ay) + radius(b, ax, ay)) return false;
  }
  return true;
}

/** Whether two label rectangles overlap, rotation included. */
export function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  return entriesOverlap(entry(a), entry(b));
}

/** A uniform grid of placed boxes, so each candidate is tested only against its neighbours. */
class CollisionGrid {
  private cells = new Map<number, Entry[]>();
  private stamp = 0;
  constructor(private readonly size = 48) {}
  private each(box: Entry, visit: (cell: Entry[] | undefined, key: number) => boolean | void): boolean {
    for (let i = Math.floor(box.minX / this.size); i <= Math.floor(box.maxX / this.size); i++) {
      for (let j = Math.floor(box.minY / this.size); j <= Math.floor(box.maxY / this.size); j++) {
        const key = (i + 32768) * 65536 + (j + 32768);
        if (visit(this.cells.get(key), key)) return true;
      }
    }
    return false;
  }
  insert(box: Entry): void {
    this.each(box, (cell, key) => { if (cell) cell.push(box); else this.cells.set(key, [box]); });
  }
  /** `origin`: a number's own spot, whose dots its anchor offset already clears. `overDots`: a road name's last resort. */
  collides(box: Entry, { origin, overDots = false }: { origin?: ScreenPoint; overDots?: boolean } = {}): boolean {
    const stamp = ++this.stamp;
    return this.each(box, cell => cell?.some(other => {
      if (other.stamp === stamp) return false;
      other.stamp = stamp;
      if (origin && other.kind !== 'label' && Math.abs(other.cx - origin.x) < 0.5 && Math.abs(other.cy - origin.y) < 0.5) return false;
      if (overDots && other.kind === 'dot') return false;
      return entriesOverlap(box, other);
    }));
  }
}

function inside(box: Entry, layout: LabelLayout): boolean {
  return box.minX >= EDGE && box.minY >= EDGE && box.maxX <= layout.width - EDGE && box.maxY <= layout.height - EDGE;
}

/** Label centre offsets around a dot, in preference order. */
export function pointAnchors(label: Pick<PointLabel, 'width' | 'height' | 'clearance'>): ScreenPoint[] {
  const reach = label.clearance + GAP, hw = label.width / 2, hh = label.height / 2;
  return ANCHORS.map(([x, y]) => x && y
    ? { x: x * (hw + reach * DIAGONAL), y: y * (hh + reach * DIAGONAL) }
    : { x: x * (hw + reach), y: y * (hh + reach) });
}

type Measured = { points: ScreenPoint[]; lengths: number[] };

function measure(line: ScreenPoint[]): Measured {
  const lengths = [0];
  for (let i = 1; i < line.length; i++) lengths.push(lengths[i - 1] + Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y));
  return { points: line, lengths };
}

function at(line: Measured, distance: number): { point: ScreenPoint; index: number } {
  const { points, lengths } = line;
  let low = 0, high = lengths.length - 1;
  while (high - low > 1) { const middle = (low + high) >> 1; if (lengths[middle] <= distance) low = middle; else high = middle; }
  const span = lengths[high] - lengths[low], t = span ? (distance - lengths[low]) / span : 0;
  return { point: { x: points[low].x + (points[high].x - points[low].x) * t, y: points[low].y + (points[high].y - points[low].y) * t }, index: low };
}

/** The stretches of a line inside the view, as distances along it, so a long road off screen costs one pass over its vertices. */
function onScreen(line: Measured, layout: LabelLayout): [number, number][] {
  const { points, lengths } = line, ranges: [number, number][] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], dx = points[i].x - a.x, dy = points[i].y - a.y;
    // Liang-Barsky: clip the segment to the view.
    let t0 = 0, t1 = 1;
    for (const [p, q] of [[-dx, a.x], [dx, layout.width - a.x], [-dy, a.y], [dy, layout.height - a.y]]) {
      if (p === 0) { if (q < 0) t0 = Infinity; } else if (p < 0) t0 = Math.max(t0, q / p); else t1 = Math.min(t1, q / p);
    }
    if (t0 > t1) continue;
    const span = lengths[i] - lengths[i - 1], from = lengths[i - 1] + t0 * span, to = lengths[i - 1] + t1 * span;
    const last = ranges[ranges.length - 1];
    if (last && from <= last[1] + 1e-6) last[1] = Math.max(last[1], to); else ranges.push([from, to]);
  }
  return ranges;
}

/** Distances from `middle` outward in ROAD_STEP steps, up to `reach` either side. */
function* outward(middle: number, reach: number): Generator<number> {
  yield middle;
  for (let step = ROAD_STEP; step <= reach; step += ROAD_STEP) { yield middle - step; yield middle + step; }
}

/**
 * The label box for a road name centred at `distance` along the line, or null
 * where the road bends too much under the text for a straight label to cover it.
 */
export function roadBox(line: ScreenPoint[] | Measured, distance: number, width: number, height: number): LabelBox | null {
  const measured = Array.isArray(line) ? measure(line) : line;
  const half = width / 2;
  if (distance - half < 0 || distance + half > measured.lengths[measured.lengths.length - 1]) return null;
  const start = at(measured, distance - half), end = at(measured, distance + half);
  const dx = end.point.x - start.point.x, dy = end.point.y - start.point.y, chord = Math.hypot(dx, dy);
  if (chord < width * 0.9) return null;
  const tolerance = Math.max(2, height / 3);
  for (let i = start.index + 1; i <= end.index; i++) {
    const p = measured.points[i];
    if (Math.abs((p.x - start.point.x) * dy - (p.y - start.point.y) * dx) / chord > tolerance) return null;
  }
  return { cx: (start.point.x + end.point.x) / 2, cy: (start.point.y + end.point.y) / 2, hw: half, hh: height / 2, angle: upright(dx, dy) };
}

/** Keeps text reading left to right: a road drawn east-to-west gets the same label as one drawn west-to-east. */
function upright(dx: number, dy: number): number {
  const angle = Math.atan2(dy, dx);
  return angle > Math.PI / 2 ? angle - Math.PI : angle <= -Math.PI / 2 ? angle + Math.PI : angle;
}

/**
 * A road too short or winding for its name to run along: one straight label
 * over it at `distance`, turned to the road's direction there. Null where the
 * road wanders more than a label height from that line.
 */
export function acrossBox(line: ScreenPoint[] | Measured, distance: number, width: number, height: number): LabelBox | null {
  const measured = Array.isArray(line) ? measure(line) : line;
  const total = measured.lengths[measured.lengths.length - 1];
  const centre = at(measured, distance).point;
  const start = at(measured, Math.max(0, distance - width / 2)), end = at(measured, Math.min(total, distance + width / 2));
  const dx = end.point.x - start.point.x, dy = end.point.y - start.point.y, chord = Math.hypot(dx, dy);
  if (chord) {
    for (const p of [start.point, end.point, ...measured.points.slice(start.index + 1, end.index + 1)]) {
      if (Math.abs((p.x - centre.x) * dy - (p.y - centre.y) * dx) / chord > height) return null;
    }
  }
  return { cx: centre.x, cy: centre.y, hw: width / 2, hh: height / 2, angle: upright(dx, dy) };
}

/**
 * Places Poker's labels for one view: the selected address, then highway and
 * ordinary road names, then civic and postal numbers, then tracks and trails.
 * Returns only the labels that fit.
 */
export function placeLabels(layout: LabelLayout): { points: PlacedPoint[]; roads: PlacedRoad[] } {
  const grid = new CollisionGrid();
  const points: PlacedPoint[] = [], roads: PlacedRoad[] = [];
  for (const rect of layout.obstacles ?? []) {
    grid.insert(entry({ cx: (rect.left + rect.right) / 2, cy: (rect.top + rect.bottom) / 2, hw: (rect.right - rect.left) / 2, hh: (rect.bottom - rect.top) / 2, angle: 0 }));
  }
  for (const point of layout.points) {
    const reach = Math.max(DOT_RADIUS, point.clearance);
    grid.insert(entry({ cx: point.x, cy: point.y, hw: reach, hh: reach, angle: 0 }, point.selected ? 'ring' : 'dot'));
  }
  const placePoint = (point: PointLabel) => {
    const box = (offset: ScreenPoint) => entry({ cx: point.x + offset.x, cy: point.y + offset.y, hw: point.width / 2 + POINT_PAD, hh: point.height / 2 + POINT_PAD, angle: 0 });
    let chosen: { offset: ScreenPoint; box: Entry } | null = null;
    for (const offset of pointAnchors(point)) {
      const candidate = box(offset);
      if (grid.collides(candidate, { origin: point })) continue;
      if (inside(candidate, layout)) { chosen = { offset, box: candidate }; break; }
      chosen ??= { offset, box: candidate };
    }
    if (!chosen && (point.selected || layout.showAllPoints)) {
      const offset = pointAnchors(point)[0];
      chosen = { offset, box: box(offset) };
    }
    if (!chosen) return;
    grid.insert(chosen.box);
    points.push({ kind: 'point', key: point.key, dx: chosen.offset.x, dy: chosen.offset.y });
  };
  const placeRoad = (road: RoadLabel) => {
    const runs = road.lines.map(measure).map(measured => ({ measured, total: measured.lengths[measured.lengths.length - 1], shown: onScreen(measured, layout) }))
      .filter(run => run.shown.length);
    const placed: ScreenPoint[] = [];
    const tryAt = (distances: Iterable<number>, shapeAt: (distance: number) => LabelBox | null, overDots: boolean) => {
      for (const distance of distances) {
        const shape = shapeAt(distance);
        if (!shape || placed.some(p => Math.hypot(p.x - shape.cx, p.y - shape.cy) < REPEAT_GAP)) continue;
        const box = entry({ ...shape, hw: shape.hw + ROAD_PAD, hh: shape.hh + ROAD_PAD });
        if (!inside(box, layout) || grid.collides(box, { overDots })) continue;
        grid.insert(box);
        placed.push({ x: shape.cx, y: shape.cy });
        roads.push({ kind: 'road', key: road.key, index: placed.length - 1, x: shape.cx, y: shape.cy, angle: shape.angle * 180 / Math.PI });
        return true;
      }
      return false;
    };
    const shownAt = (shown: [number, number][], distance: number) => shown.some(([from, to]) => distance >= from && distance <= to);
    // Clear of every address dot where possible; over one, which still draws on top, rather than leave the road unnamed.
    for (const overDots of [false, true]) {
      for (const { measured, total, shown } of runs) {
        if (total < road.width) continue;
        // Windows are fixed along the whole run, so a pan does not move a name that stays in view.
        const windows = Math.max(1, Math.round(total / ROAD_SPACING)), span = total / windows;
        for (let w = 0; w < windows; w++) {
          if (!shown.some(([from, to]) => to >= w * span && from <= (w + 1) * span)) continue;
          const distances = [...outward(span * (w + 0.5), span / 2)].filter(d => d >= road.width / 2 && d <= total - road.width / 2 && shownAt(shown, d));
          tryAt(distances, distance => roadBox(measured, distance, road.width, road.height), overDots);
        }
      }
      if (placed.length) return;
    }
    // Too short or winding to run along: one label over the middle of its longest stretch on screen,
    // never hanging past the ends of the run, where it would cross the road it meets.
    const stretches = runs.flatMap(({ measured, total, shown }) => {
      const reach = Math.min(road.width / 2, total / 2);
      return shown.map(([from, to]) => ({ measured, low: Math.max(from, reach), high: Math.min(to, total - reach) }));
    }).filter(stretch => stretch.high >= stretch.low).sort((a, b) => (b.high - b.low) - (a.high - a.low));
    for (const overDots of [false, true]) {
      for (const { measured, low, high } of stretches) {
        if (tryAt(outward((low + high) / 2, (high - low) / 2), distance => acrossBox(measured, distance, road.width, road.height), overDots)) return;
      }
    }
  };
  const byRank = (rank: number) => layout.roads.filter(road => road.rank === rank);
  layout.points.filter(point => point.selected).forEach(placePoint);
  [...byRank(0), ...byRank(1)].forEach(placeRoad);
  layout.points.filter(point => !point.selected).forEach(placePoint);
  byRank(2).forEach(placeRoad);
  return { points, roads };
}

type Position = number[];

/**
 * Joins a road's segments end to end where exactly two of them meet, so a name
 * can run across the joins NSRN splits a road at. Branches stay separate runs.
 */
export function mergeLines(lines: Position[][]): Position[][] {
  const key = (p: Position) => `${p[0]},${p[1]}`;
  const ends = new Map<string, number[]>();
  lines.forEach((line, i) => { for (const p of [line[0], line[line.length - 1]]) ends.set(key(p), [...(ends.get(key(p)) ?? []), i]); });
  const used = lines.map(line => line.length < 2);
  const extend = (chain: Position[]) => {
    for (;;) {
      const touching = ends.get(key(chain[chain.length - 1])) ?? [];
      const next = touching.length === 2 ? touching.find(i => !used[i]) : undefined;
      if (next === undefined) return chain;
      used[next] = true;
      const line = lines[next];
      const forward = key(line[0]) === key(chain[chain.length - 1]);
      chain.push(...(forward ? line : [...line].reverse()).slice(1));
    }
  };
  // Start at dead ends and junctions first so open runs come out whole; what is left is loops.
  const order = lines.map((_, i) => i).sort((a, b) => Number(isInterior(a)) - Number(isInterior(b)));
  function isInterior(i: number) { return [lines[i][0], lines[i][lines[i].length - 1]].every(p => ends.get(key(p))?.length === 2); }
  const merged: Position[][] = [];
  for (const start of order) {
    if (used[start]) continue;
    used[start] = true;
    const chain = extend([...lines[start]]).reverse();
    merged.push(extend(chain).reverse());
  }
  return merged;
}

/** A named road merged into connected runs, with each run's bounds for a quick view test. */
export type NamedRoad = { name: string; rank: 0 | 1 | 2; lines: Position[][]; bounds: LatLngBounds[] };
// Class words standing in for a missing name are not labels.
const GENERIC_NAME = /^(Track|Trail|Driveway|Railroad|Unknown)$/iu;

/** Poker's road names, highways first and longer roads before shorter ones within a class. */
export function namedRoads(roads: GeoJSON.FeatureCollection): NamedRoad[] {
  const byName = new Map<string, { rank: 0 | 1 | 2; lines: Position[][] }>();
  for (const feature of roads.features) {
    const name = feature.properties?.street;
    if (typeof name !== 'string' || !name || GENERIC_NAME.test(name)) continue;
    const geometry = feature.geometry;
    const lines = geometry.type === 'MultiLineString' ? geometry.coordinates : geometry.type === 'LineString' ? [geometry.coordinates] : [];
    const rank = roadRank(String(feature.properties?.roadc_desc ?? ''), String(feature.properties?.feat_desc ?? ''));
    const road = byName.get(name);
    if (road) { road.rank = Math.min(road.rank, rank) as 0 | 1 | 2; road.lines.push(...lines); } else byName.set(name, { rank, lines: [...lines] });
  }
  const length = (lines: Position[][]) => lines.reduce((sum, line) => sum + line.slice(1).reduce((total, p, i) =>
    total + Math.hypot((p[0] - line[i][0]) * Math.cos(p[1] * Math.PI / 180), p[1] - line[i][1]), 0), 0);
  return [...byName].map(([name, road]) => {
    const lines = mergeLines(road.lines);
    return { road: { name, rank: road.rank, lines, bounds: lines.map(line => latLngBounds(line.map(([lng, lat]) => [lat, lng]))) }, length: length(lines) };
  }).sort((a, b) => a.road.rank - b.road.rank || b.length - a.length || a.road.name.localeCompare(b.road.name)).map(({ road }) => road);
}
