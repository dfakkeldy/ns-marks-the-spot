import sourceReceipt from "../data/openLayerSources.json";
import type { OpenDataSource, OpenDataPart } from "../layers/openDataSources";
import { openDatasetApi } from "../layers/openDataSources";
import type { MapEnvelope } from "./arcGISFeatureOverlay";

const PAGE_SIZE = 5000;
const MAX_FEATURES = 12_000;
const MAX_RESPONSE_BYTES = 24 * 1024 * 1024;
export class OpenDataAreaTooLargeError extends Error {}
export type OpenDataCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>>;

export function openDataQuery(part: OpenDataPart, bounds: MapEnvelope, offset: number, zoom = 24): string {
  const { west, east, south, north } = bounds;
  if (![west, east, south, north].every(Number.isFinite) || west >= east || south >= north || west < -180 || east > 180 || south < -90 || north > 90) throw new Error("Invalid map bounds");
  const ring = `${west} ${south},${east} ${south},${east} ${north},${west} ${north},${west} ${south}`;
  const url = new URL(openDatasetApi(part.dataset));
  const geometryType = sourceReceipt.datasets.find(({ id }) => id === part.dataset)?.geometryType;
  const tolerance = Math.max(0.01, Math.min(10, 156543.034 * Math.cos((south + north) / 2 * Math.PI / 180) / 2 ** zoom / 2));
  // Only display geometry is simplified. Filtering always uses original geometry;
  // this path must never supply parcel intersection or distance evidence.
  const geometry = geometryType && geometryType !== "point" && zoom < 18
    ? `simplify_preserve_topology(the_geom,${tolerance.toFixed(2)}) as the_geom`
    : "the_geom";
  url.searchParams.set("$select", [":id as source_row_id", geometry, ...part.fields].join(","));
  url.searchParams.set("$where", `intersects(the_geom, 'POLYGON((${ring}))')${part.where ? ` AND (${part.where})` : ""}`);
  url.searchParams.set("$order", ":id");
  url.searchParams.set("$limit", String(PAGE_SIZE));
  url.searchParams.set("$offset", String(offset));
  return url.toString();
}

/** Complete bounded queries only. Partial, malformed and oversized layers fail closed. */
export async function fetchOpenDataOverlay(source: OpenDataSource, bounds: MapEnvelope, signal?: AbortSignal, zoom = 24): Promise<OpenDataCollection> {
  const features: OpenDataCollection["features"] = [];
  const seen = new Set<string>();
  let bytes = 0;
  for (const part of source.parts) {
    if (part.minZoom !== undefined && zoom < part.minZoom) continue;
    for (let offset = 0; ; offset += PAGE_SIZE) {
      signal?.throwIfAborted();
      const response = await fetch(openDataQuery(part, bounds, offset, zoom), { signal });
      if (!response.ok) throw new Error(`Open data unavailable (${response.status})`);
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Open data response is unreadable");
      const chunks: Uint8Array[] = [];
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new OpenDataAreaTooLargeError("Open data area too large; zoom in"); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const data = JSON.parse(await new Blob(chunks as BlobPart[]).text()) as OpenDataCollection;
      if (data.type !== "FeatureCollection" || !Array.isArray(data.features)) throw new Error("Invalid open data collection");
      for (const f of data.features) {
        if (f.type !== "Feature" || !f.geometry || !f.properties?.source_row_id) throw new Error("Open data geometry or identifier missing");
        const id = `${part.dataset}:${f.properties.source_row_id}`;
        if (seen.has(id)) throw new Error("Open data pagination changed; retry");
        seen.add(id);
        features.push({ ...f, id, properties: { ...f.properties, source_dataset: part.dataset, source_color: part.color ?? source.color } });
        if (features.length > MAX_FEATURES) throw new OpenDataAreaTooLargeError("Open data area too large; zoom in");
      }
      if (data.features.length < PAGE_SIZE) break;
    }
  }
  return { type: "FeatureCollection", features };
}
