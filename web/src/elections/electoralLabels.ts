import type { ElectoralLayer } from "../layers/electoralLayers";
import type { ElectoralMode } from "../layers/electoralLayers";

type Ring = readonly (readonly number[])[];
type Polygon = readonly Ring[];

/** Planar area of a lon/lat ring, with longitude scaled by cos(latitude). Signed. */
function ringArea(ring: Ring, cosLat: number): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j][0] * cosLat * ring[i][1] - ring[i][0] * cosLat * ring[j][1];
  }
  return sum / 2;
}

function insideRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function insidePolygon(lon: number, lat: number, polygon: Polygon): boolean {
  return insideRing(lon, lat, polygon[0]) && !polygon.slice(1).some((hole) => insideRing(lon, lat, hole));
}

/** The midpoint of the widest stretch of `polygon` along the line of latitude `lat`, if any. */
function widestSpanMidpoint(polygon: Polygon, lat: number): [number, number] | null {
  const crossings: number[] = [];
  for (const ring of polygon) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat)) crossings.push(((xj - xi) * (lat - yi)) / (yj - yi) + xi);
    }
  }
  crossings.sort((a, b) => a - b);
  let best: [number, number] | null = null;
  let width = 0;
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    if (crossings[i + 1] - crossings[i] > width) {
      width = crossings[i + 1] - crossings[i];
      best = [(crossings[i] + crossings[i + 1]) / 2, lat];
    }
  }
  return best;
}

export interface LabelPoint {
  /** [longitude, latitude], always inside the district's largest part. */
  readonly position: readonly [number, number];
  /** Area of that largest part, in scaled square degrees: a priority, not a measurement. */
  readonly weight: number;
}

/**
 * Where a district's name goes: the area centroid of its largest part, or,
 * when that falls outside the part (a crescent of coast, a bay), the middle
 * of the part's widest east-west stretch through it. Leaflet's own tooltip
 * centre uses only the first ring, which for a multi-island district can be
 * a small island.
 */
export function electoralLabelPoint(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): LabelPoint | null {
  const polygons: Polygon[] = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let largest: Polygon | null = null;
  let largestArea = 0;
  let cosLat = 1;
  for (const polygon of polygons) {
    const outer = polygon[0];
    if (!outer || outer.length < 4) continue;
    const meanLat = outer.reduce((total, [, lat]) => total + lat, 0) / outer.length;
    const scale = Math.cos((meanLat * Math.PI) / 180);
    const area = Math.abs(ringArea(outer, scale)) - polygon.slice(1).reduce((total, hole) => total + Math.abs(ringArea(hole, scale)), 0);
    if (area > largestArea) {
      largest = polygon;
      largestArea = area;
      cosLat = scale;
    }
  }
  if (!largest) return null;
  const outer = largest[0];
  let cx = 0;
  let cy = 0;
  let twice = 0;
  for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
    const cross = outer[j][0] * cosLat * outer[i][1] - outer[i][0] * cosLat * outer[j][1];
    cx += (outer[j][0] * cosLat + outer[i][0] * cosLat) * cross;
    cy += (outer[j][1] + outer[i][1]) * cross;
    twice += cross;
  }
  if (twice !== 0) {
    const lon = cx / (3 * twice) / cosLat;
    const lat = cy / (3 * twice);
    if (insidePolygon(lon, lat, largest)) return { position: [lon, lat], weight: largestArea };
    const span = widestSpanMidpoint(largest, lat);
    if (span) return { position: span, weight: largestArea };
  }
  // Degenerate ring: the middle of the bounding box's widest stretch.
  const lats = outer.map(([, lat]) => lat);
  const span = widestSpanMidpoint(largest, (Math.min(...lats) + Math.max(...lats)) / 2);
  return span ? { position: span, weight: largestArea } : null;
}

export interface LabelBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * Which labels to keep so none overlap: the heaviest (largest district)
 * first, each later one only if it clears every kept box by `gap` pixels.
 * Returns the kept indexes.
 */
export function declutterLabels(boxes: readonly LabelBox[], weights: readonly number[], gap = 4): Set<number> {
  const order = boxes.map((_, index) => index).sort((a, b) => weights[b] - weights[a]);
  const kept: LabelBox[] = [];
  const keep = new Set<number>();
  for (const index of order) {
    const box = boxes[index];
    if (box.right <= box.left || box.bottom <= box.top) continue;
    const clear = kept.every((other) =>
      box.right + gap <= other.left || other.right + gap <= box.left || box.bottom + gap <= other.top || other.bottom + gap <= box.top);
    if (clear) {
      kept.push(box);
      keep.add(index);
    }
  }
  return keep;
}

/** Federal ridings name themselves below this zoom; provincial districts from it. */
export const ELECTORAL_LABEL_HANDOFF_ZOOM = 8;

/**
 * Whether a layer's areas carry permanent names at `zoom`. Boundaries mode
 * labels districts only (never polling divisions, which are thousands of
 * areas, and never municipal districts, whose names repeat the
 * municipality). When a provincial district layer is on, federal ridings
 * hand their names over to it at the handoff zoom, so two sets of names
 * never pile up at one scale.
 */
export function electoralLabelsPermanent(
  layer: ElectoralLayer,
  mode: ElectoralMode,
  zoom: number,
  print: boolean,
  provincialLabelsShown: boolean,
): boolean {
  const { level, kind } = layer.electoral;
  if (mode !== "boundaries") return print || zoom >= 9;
  if (kind !== "districts" || level === "Municipal") return false;
  if (level === "Federal") return !provincialLabelsShown || zoom < ELECTORAL_LABEL_HANDOFF_ZOOM;
  return print || zoom >= ELECTORAL_LABEL_HANDOFF_ZOOM;
}
