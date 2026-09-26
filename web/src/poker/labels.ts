/**
 * Screen-space label placement for Poker. Road names lie along straight runs of
 * their road; civic numbers try eight positions around their dot. A label that
 * finds no clear space is left off for this view rather than drawn over another
 * one. Dots always draw, so a missing number never hides that a point exists.
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

type Entry = LabelBox & { cos: number; sin: number; minX: number; minY: number; maxX: number; maxY: number; stamp: number; dot: boolean };

function entry(box: LabelBox, dot = false): Entry {
  const cos = Math.cos(box.angle), sin = Math.sin(box.angle);
  const ex = box.hw * Math.abs(cos) + box.hh * Math.abs(sin), ey = box.hw * Math.abs(sin) + box.hh * Math.abs(cos);
  return { ...box, cos, sin, minX: box.cx - ex, minY: box.cy - ey, maxX: box.cx + ex, maxY: box.cy + ey, stamp: 0, dot };
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
  /** A number's own dot, and any dot at the same spot, is cleared by its anchor offset rather than tested. */
  collides(box: Entry, origin?: ScreenPoint): boolean {
    const stamp = ++this.stamp;
    return this.each(box, cell => cell?.some(other => {
      if (other.stamp === stamp) return false;
      other.stamp = stamp;
      if (origin && other.dot && Math.abs(other.cx - origin.x) < 0.5 && Math.abs(other.cy - origin.y) < 0.5) return false;
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
 * A road shorter than its name: one straight label over it at `distance`,
 * turned to the road's direction there. Null where the road wanders more than
 * a label height from that line, so a name never cuts across a bend.
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

/** Candidate distances along a line: one window per ROAD_SPACING, searched outward from its middle. */
function roadCandidates(total: number, width: number): number[][] {
  if (total < width) return [];
  const windows = Math.max(1, Math.round(total / ROAD_SPACING)), span = total / windows;
  return Array.from({ length: windows }, (_, w) => {
    const middle = span * (w + 0.5), found: number[] = [];
    for (let step = 0; step <= span / 2; step += ROAD_STEP) {
      for (const distance of step ? [middle - step, middle + step] : [middle]) {
        if (distance >= width / 2 && distance <= total - width / 2) found.push(distance);
      }
    }
    return found;
  });
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
    grid.insert(entry({ cx: point.x, cy: point.y, hw: reach, hh: reach, angle: 0 }, true));
  }
  const placePoint = (point: PointLabel) => {
    let fallback: { offset: ScreenPoint; box: Entry } | null = null;
    for (const offset of pointAnchors(point)) {
      const box = entry({ cx: point.x + offset.x, cy: point.y + offset.y, hw: point.width / 2 + POINT_PAD, hh: point.height / 2 + POINT_PAD, angle: 0 });
      if (grid.collides(box, point)) continue;
      if (inside(box, layout)) { fallback = { offset, box }; break; }
      fallback ??= { offset, box };
    }
    if (!fallback && (point.selected || layout.showAllPoints)) {
      const offset = pointAnchors(point)[0];
      fallback = { offset, box: entry({ cx: point.x + offset.x, cy: point.y + offset.y, hw: point.width / 2 + POINT_PAD, hh: point.height / 2 + POINT_PAD, angle: 0 }) };
    }
    if (!fallback) return;
    grid.insert(fallback.box);
    points.push({ kind: 'point', key: point.key, dx: fallback.offset.x, dy: fallback.offset.y });
  };
  const placeRoad = (road: RoadLabel) => {
    const placed: ScreenPoint[] = [];
    let index = 0;
    for (const line of road.lines) {
      const measured = measure(line);
      for (const window of roadCandidates(measured.lengths[measured.lengths.length - 1], road.width)) {
        for (const distance of window) {
          const centre = at(measured, distance).point;
          if (centre.x < 0 || centre.y < 0 || centre.x > layout.width || centre.y > layout.height) continue;
          const shape = roadBox(measured, distance, road.width, road.height);
          if (!shape) continue;
          const box = entry({ ...shape, hw: shape.hw + ROAD_PAD, hh: shape.hh + ROAD_PAD });
          if (!inside(box, layout) || placed.some(p => Math.hypot(p.x - shape.cx, p.y - shape.cy) < REPEAT_GAP) || grid.collides(box)) continue;
          grid.insert(box);
          placed.push({ x: shape.cx, y: shape.cy });
          roads.push({ kind: 'road', key: road.key, index: index++, x: shape.cx, y: shape.cy, angle: shape.angle * 180 / Math.PI });
          break;
        }
      }
    }
    if (index) return;
    // Too short or winding to run along in view: one label over the middle of its longest stretch on screen.
    const stretches = road.lines.map(measure).map(measured => {
      const total = measured.lengths[measured.lengths.length - 1];
      let low = Infinity, high = -Infinity;
      for (let distance = 0; distance <= total; distance += ROAD_STEP / 2) {
        const p = at(measured, distance).point;
        if (p.x >= 0 && p.y >= 0 && p.x <= layout.width && p.y <= layout.height) { low = Math.min(low, distance); high = Math.max(high, distance); }
      }
      return { measured, low, high };
    }).filter(stretch => stretch.high >= stretch.low).sort((a, b) => (b.high - b.low) - (a.high - a.low));
    for (const { measured, low, high } of stretches) {
      const middle = (low + high) / 2;
      for (let step = 0; step <= (high - low) / 2; step += ROAD_STEP) {
        for (const distance of step ? [middle - step, middle + step] : [middle]) {
          const shape = acrossBox(measured, distance, road.width, road.height);
          if (!shape) continue;
          const box = entry({ ...shape, hw: shape.hw + ROAD_PAD, hh: shape.hh + ROAD_PAD });
          if (!inside(box, layout) || grid.collides(box)) continue;
          grid.insert(box);
          roads.push({ kind: 'road', key: road.key, index: 0, x: shape.cx, y: shape.cy, angle: shape.angle * 180 / Math.PI });
          return;
        }
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
