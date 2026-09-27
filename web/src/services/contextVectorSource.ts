import type { ContextLayerDescriptor, ContextVectorSource } from "../layers/contextLayerTypes";
import { ArcGISFeatureSizeError, fetchArcGISFeatureOverlay, type MapEnvelope } from "./arcGISFeatureOverlay";

type Collection = GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>>;
type IndexedCollection = { collection: Collection; envelopes: MapEnvelope[] };
const PAGE_SIZE = 2_000;
const MAX_FEATURES = 10_000;
const MAX_BYTES = 20 * 1024 * 1024;
const snapshots = new WeakMap<ContextLayerDescriptor, IndexedCollection>();

export class ContextAreaTooLargeError extends Error {}
export class ContextOutsideCoverageError extends Error {}

function validBounds(b: MapEnvelope) {
  if (![b.west, b.east, b.south, b.north].every(Number.isFinite) || b.west >= b.east || b.south >= b.north || b.west < -180 || b.east > 180 || b.south < -90 || b.north > 90) throw new Error("Invalid map bounds");
}
function intersects(a: MapEnvelope, b: MapEnvelope) {
  return a.west <= b.east && a.east >= b.west && a.south <= b.north && a.north >= b.south;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function identifier(value: unknown): value is string | number {
  return typeof value === "string" ? value.trim().length > 0 : typeof value === "number" && Number.isFinite(value);
}
function coordinate(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return Number(value);
  throw new Error("Source returned an invalid coordinate");
}

/** Check geometry before Leaflet sees it, and index only display envelopes. */
function geometryEnvelope(value: unknown): MapEnvelope {
  if (!record(value)) throw new Error("Source geometry is missing");
  const envelope = { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity };
  const include = (b: MapEnvelope) => {
    envelope.west = Math.min(envelope.west, b.west); envelope.east = Math.max(envelope.east, b.east);
    envelope.south = Math.min(envelope.south, b.south); envelope.north = Math.max(envelope.north, b.north);
  };
  const walk = (coords: unknown, depth: number) => {
    if (!Array.isArray(coords) || coords.length === 0) throw new Error("Source returned invalid geometry");
    if (depth > 0) { for (const child of coords) walk(child, depth - 1); return; }
    if (coords.length < 2 || typeof coords[0] !== "number" || typeof coords[1] !== "number") throw new Error("Source returned invalid geometry coordinates");
    const [x, y] = coords;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < -180 || x > 180 || y < -90 || y > 90) throw new Error("Source geometry is not WGS84 longitude/latitude");
    include({ west: x, east: x, south: y, north: y });
  };
  if (value.type === "GeometryCollection") {
    if (!Array.isArray(value.geometries) || value.geometries.length === 0) throw new Error("Source returned invalid geometry collection");
    for (const geometry of value.geometries) include(geometryEnvelope(geometry));
  } else {
    const depths: Record<string, number> = { Point: 0, MultiPoint: 1, LineString: 1, MultiLineString: 2, Polygon: 2, MultiPolygon: 3 };
    if (typeof value.type !== "string" || !Object.hasOwn(depths, value.type)) throw new Error("Source returned unsupported geometry");
    walk(value.coordinates, depths[value.type]);
  }
  return envelope;
}

async function readJson(url: string, signal: AbortSignal | undefined, budget: { bytes: number }): Promise<unknown> {
  signal?.throwIfAborted();
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Source unavailable (HTTP ${response.status}). Pan to retry.`);
  if (Number(response.headers.get("content-length")) + budget.bytes > MAX_BYTES) throw new ContextAreaTooLargeError("Source response too large");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Source response is unreadable");
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      budget.bytes += value.byteLength;
      if (budget.bytes > MAX_BYTES) { await reader.cancel(); throw new ContextAreaTooLargeError("Source response too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  signal?.throwIfAborted();
  return JSON.parse(await new Blob(chunks as BlobPart[]).text());
}

function indexCollection(value: unknown, idField: string): IndexedCollection {
  if (!record(value) || value.type !== "FeatureCollection" || !Array.isArray(value.features)) throw new Error("Source returned an invalid collection");
  if (value.exceededTransferLimit || (record(value.properties) && value.properties.exceededTransferLimit) || value.next || (Array.isArray(value.links) && value.links.some(link => record(link) && link.rel === "next"))) throw new Error("Source returned an incomplete collection");
  if (value.features.length > MAX_FEATURES) throw new ContextAreaTooLargeError("Too many source features");
  const ids = new Set<string>();
  const envelopes: MapEnvelope[] = [];
  const features = value.features.map((feature: unknown) => {
    if (!record(feature) || feature.type !== "Feature" || !record(feature.properties)) throw new Error("Source returned an invalid feature");
    const id = feature.properties[idField] ?? feature.id;
    if (!identifier(id)) throw new Error("Source record identifier is missing");
    if (ids.has(String(id))) throw new Error("Source returned duplicate identifiers; retry");
    ids.add(String(id));
    envelopes.push(geometryEnvelope(feature.geometry));
    return { ...feature, id } as Collection["features"][number];
  });
  return { collection: { type: "FeatureCollection", features }, envelopes };
}

async function fetchSocrata(source: Extract<ContextVectorSource, { kind: "socrata-points" }>, bounds: MapEnvelope, signal?: AbortSignal): Promise<Collection> {
  const features: Collection["features"] = [];
  const seen = new Set<string>();
  const budget = { bytes: 0 };
  for (let offset = 0; offset <= MAX_FEATURES; offset += PAGE_SIZE) {
    const url = new URL(`https://data.novascotia.ca/resource/${source.dataset}.json`);
    url.searchParams.set("$select", [...new Set([":id as source_row_id", source.latitudeField, source.longitudeField, ...source.fields])].join(","));
    url.searchParams.set("$where", `${source.latitudeField} between ${bounds.south} and ${bounds.north} AND ${source.longitudeField} between ${bounds.west} and ${bounds.east}${source.where ? ` AND (${source.where})` : ""}`);
    url.searchParams.set("$order", ":id"); url.searchParams.set("$limit", String(PAGE_SIZE)); url.searchParams.set("$offset", String(offset));
    const rows = await readJson(url.toString(), signal, budget);
    if (!Array.isArray(rows)) throw new Error("Source returned an invalid point table");
    for (const row of rows) {
      if (!record(row) || !identifier(row.source_row_id)) throw new Error("Source record identifier is missing");
      const id = String(row.source_row_id);
      if (seen.has(id)) throw new Error("Source pagination returned duplicate records; retry");
      seen.add(id);
      const x = coordinate(row[source.longitudeField]); const y = coordinate(row[source.latitudeField]);
      if (x < -180 || x > 180 || y < -90 || y > 90) throw new Error("Source returned an invalid coordinate");
      if (!intersects({ west: x, east: x, south: y, north: y }, bounds)) throw new Error("Source returned coordinates outside the requested viewport");
      features.push({ type: "Feature", id, properties: row, geometry: { type: "Point", coordinates: [x, y] } });
      if (features.length > MAX_FEATURES) throw new ContextAreaTooLargeError("Too many source records");
    }
    if (rows.length < PAGE_SIZE) return { type: "FeatureCollection", features };
  }
  throw new ContextAreaTooLargeError("Source pagination exceeded the safety limit");
}

async function fetchOgc(layer: ContextLayerDescriptor, bounds: MapEnvelope, signal?: AbortSignal): Promise<Collection> {
  const first = new URL(layer.serviceUrl);
  first.searchParams.set("bbox", `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`);
  first.searchParams.set("f", "json"); first.searchParams.set("limit", String(PAGE_SIZE));
  let url = first;
  const visited = new Set<string>();
  const features: Collection["features"] = [];
  const budget = { bytes: 0 };
  for (let page = 0; page < 20; page += 1) {
    if (visited.has(url.href)) throw new Error("Source pagination repeated a page");
    visited.add(url.href);
    const value = await readJson(url.href, signal, budget);
    if (!record(value) || !Array.isArray(value.features)) throw new Error("Source returned an invalid OGC collection");
    const next = Array.isArray(value.links) ? value.links.filter(link => record(link) && link.rel === "next") : [];
    const indexed = indexCollection({ ...value, links: [] }, layer.idField ?? "id");
    features.push(...indexed.collection.features);
    if (features.length > MAX_FEATURES) throw new ContextAreaTooLargeError("Too many source features");
    if (!next.length) {
      if (typeof value.numberMatched === "number" && value.numberMatched > features.length) throw new Error("Source returned an incomplete collection");
      // Validate identities across pages, in addition to each page's geometry.
      return indexCollection({ type: "FeatureCollection", features }, layer.idField ?? "id").collection;
    }
    if (next.length !== 1 || !record(next[0]) || typeof next[0].href !== "string") throw new Error("Invalid source pagination link");
    url = new URL(next[0].href, url);
    if (url.origin !== first.origin || url.pathname !== first.pathname) throw new Error("Unexpected source pagination destination");
  }
  throw new ContextAreaTooLargeError("Source pagination exceeded the safety limit");
}

/** No fallback from errors to empty records, and no query for known outside coverage. */
export async function fetchContextFeatures(layer: ContextLayerDescriptor, bounds: MapEnvelope, signal?: AbortSignal): Promise<Collection> {
  validBounds(bounds); signal?.throwIfAborted();
  if (layer.coverageBounds && !intersects(layer.coverageBounds, bounds)) throw new ContextOutsideCoverageError("Outside source coverage");
  const source = layer.vectorSource;
  if (source?.kind === "socrata-points") return fetchSocrata(source, bounds, signal);
  if (source?.kind === "ogc-features") return fetchOgc(layer, bounds, signal);
  if (source?.kind === "geojson") {
    let indexed = snapshots.get(layer);
    if (!indexed) {
      indexed = indexCollection(await readJson(source.url, signal, { bytes: 0 }), layer.idField ?? "OBJECTID");
      signal?.throwIfAborted();
      snapshots.set(layer, indexed);
    }
    return { type: "FeatureCollection", features: indexed.collection.features.filter((_, i) => intersects(indexed.envelopes[i], bounds)) };
  }
  return fetchArcGISFeatureOverlay<GeoJSON.Geometry>({
    serviceUrl: layer.serviceUrl, bounds,
    outFields: layer.outFields ?? [layer.idField ?? "OBJECTID"], idField: layer.idField ?? "OBJECTID", orderByFields: layer.idField ?? "OBJECTID", signal,
    ...(layer.featureWhere ? { where: layer.featureWhere } : {}),
    responseLimitBytes: MAX_BYTES,
  }).catch((error: unknown) => {
    if (error instanceof ArcGISFeatureSizeError) throw new ContextAreaTooLargeError(error.message);
    throw error;
  });
}
