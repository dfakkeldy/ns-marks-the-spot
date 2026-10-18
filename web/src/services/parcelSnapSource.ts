import { FIELD_CAPTURE_SPEC } from "../location/captureSpec";
import {
  fetchArcGISFeatureOverlay,
  type ArcGISFeatureCollection,
  type MapEnvelope,
} from "./arcGISFeatureOverlay";
import { NSPRD_LAYER_URL } from "./nsprd";

/**
 * The parcel-geometry source behind snap-to-parcel drawing: NSPRD polygons
 * for a viewport, cached by PID so panning back and forth does not refetch.
 * Pure data layer — the licence gate, the zoom gate, and the moveend
 * lifecycle live with the UI that arms snapping (the field-capture design's
 * W5), which must not call this before the province licence is accepted.
 * Parcel geometry is never persisted: the cache is in-memory and cleared
 * when the edit session ends. NSPRD's own caveat stands — a traced boundary
 * is not a survey.
 */

/** Zoom floor and mount cap come from the parity-pinned contract. */
export const PARCEL_SNAP_MIN_ZOOM = FIELD_CAPTURE_SPEC.snap.minZoom;
export const PARCEL_SNAP_MOUNT_MAX = FIELD_CAPTURE_SPEC.snap.maxParcels;
/**
 * Cache bound (web implementation detail, not contract): ~2 KB per parsed
 * parcel puts the worst case near 6 MB, and 3000 parcels is several screens
 * of panning at the zoom-16 floor.
 */
export const PARCEL_SNAP_CACHE_MAX = 3_000;

export type ParcelSnapFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  Record<string, unknown>
>;

/**
 * Ready hands over every cached parcel intersecting the viewport; dense
 * hands over none. Fail closed and say so — silently snapping to a random
 * subset of visible parcels would misrepresent what is snappable.
 */
export type ParcelSnapSelection =
  | { status: "ready"; parcels: ParcelSnapFeature[] }
  | { status: "dense"; count: number; max: number };

type FetchOverlay = typeof fetchArcGISFeatureOverlay;

function isPolygonal(
  feature: ArcGISFeatureCollection<GeoJSON.Geometry>["features"][number],
): feature is ParcelSnapFeature {
  return (
    feature.geometry?.type === "Polygon" ||
    feature.geometry?.type === "MultiPolygon"
  );
}

/**
 * One paged, deduplicated envelope query for the parcels intersecting
 * `bounds`. Paging, the fail-closed page cap, and PID dedupe come from
 * fetchArcGISFeatureOverlay; mineralProximity.ts already proves this
 * endpoint serves polygon GeoJSON for spatial queries.
 */
export async function fetchSnapParcels(
  bounds: MapEnvelope,
  options: { signal?: AbortSignal; fetchOverlay?: FetchOverlay } = {},
): Promise<ParcelSnapFeature[]> {
  const fetchOverlay = options.fetchOverlay ?? fetchArcGISFeatureOverlay;
  const collection = await fetchOverlay<GeoJSON.Polygon | GeoJSON.MultiPolygon>({
    serviceUrl: NSPRD_LAYER_URL,
    bounds,
    outFields: ["PID"],
    orderByFields: "PID",
    idField: "PID",
    signal: options.signal,
  });
  return collection.features.filter(isPolygonal);
}

function geometryEnvelope(feature: ParcelSnapFeature): MapEnvelope | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  const visit = (coords: unknown): void => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      const [lon, lat] = coords as [number, number];
      west = Math.min(west, lon);
      east = Math.max(east, lon);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
      return;
    }
    for (const inner of coords) visit(inner);
  };
  visit(feature.geometry.coordinates);
  return Number.isFinite(west) ? { west, south, east, north } : null;
}

function envelopesIntersect(a: MapEnvelope, b: MapEnvelope): boolean {
  return a.west <= b.east && a.east >= b.west && a.south <= b.north && a.north >= b.south;
}

type CacheEntry = { feature: ParcelSnapFeature; envelope: MapEnvelope };

/**
 * PID-keyed LRU over fetched parcels. Map insertion order is the recency
 * order: re-adding a PID (every moveend refetch re-adds what is in view)
 * moves it to newest, so eviction sheds the parcels panned away from
 * longest ago. Reads are deliberately pure — the add path is what touches.
 */
export class ParcelSnapCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(
    private readonly maxEntries: number = PARCEL_SNAP_CACHE_MAX,
    private readonly mountMax: number = PARCEL_SNAP_MOUNT_MAX,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  add(features: readonly ParcelSnapFeature[]): void {
    for (const feature of features) {
      const pid = feature.properties?.PID;
      // NSPRD always publishes a PID; a feature without one cannot be keyed
      // (or deduplicated) and is dropped rather than cached forever.
      if (typeof pid !== "string" && typeof pid !== "number") {
        continue;
      }
      const envelope = geometryEnvelope(feature);
      if (!envelope) {
        continue;
      }
      const key = String(pid);
      this.entries.delete(key);
      this.entries.set(key, { feature, envelope });
    }
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }
  }

  inViewport(bounds: MapEnvelope): ParcelSnapSelection {
    const parcels: ParcelSnapFeature[] = [];
    for (const { feature, envelope } of this.entries.values()) {
      if (envelopesIntersect(envelope, bounds)) {
        parcels.push(feature);
      }
    }
    if (parcels.length > this.mountMax) {
      return { status: "dense", count: parcels.length, max: this.mountMax };
    }
    return { status: "ready", parcels };
  }

  clear(): void {
    this.entries.clear();
  }
}
