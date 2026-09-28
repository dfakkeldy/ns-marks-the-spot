export type MapEnvelope = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type ArcGISFeatureCollection<G extends GeoJSON.Geometry> =
  GeoJSON.FeatureCollection<G, Record<string, unknown>>;

export type ArcGISPointFeatureCollection =
  ArcGISFeatureCollection<GeoJSON.Point>;

type FetchArcGISFeatureOverlayOptions = {
  serviceUrl: string;
  bounds: MapEnvelope;
  outFields: readonly string[];
  distanceMetres?: number;
  /** Attribute filter applied by the service. Defaults to every record. */
  where?: string;
  /**
   * Field the service pages by, and the field used to deduplicate returned
   * records. Services outside the mineral catalog do not publish `geo_id`, and
   * ordering by a field a service does not have fails the whole query.
   */
  orderByFields?: string;
  idField?: string;
  signal?: AbortSignal;
  /** Optional total byte budget across all pages, before JSON parsing. */
  responseLimitBytes?: number;
};

export class ArcGISFeatureSizeError extends Error {}

const PAGE_SIZE = 2_000;
const MAX_PAGES = 10;
const DEFAULT_ID_FIELD = "geo_id";

function featureKey<G extends GeoJSON.Geometry>(
  feature: ArcGISFeatureCollection<G>["features"][number],
  idField: string,
): string {
  const sourceId = feature.properties[idField];
  return String(feature.id ?? sourceId ?? JSON.stringify(feature.geometry));
}

export async function fetchArcGISFeatureOverlay<
  G extends GeoJSON.Geometry = GeoJSON.Point,
>({
  serviceUrl,
  bounds,
  outFields,
  distanceMetres,
  where = "1=1",
  orderByFields = DEFAULT_ID_FIELD,
  idField = DEFAULT_ID_FIELD,
  signal,
  responseLimitBytes,
}: FetchArcGISFeatureOverlayOptions): Promise<ArcGISFeatureCollection<G>> {
  const features: ArcGISFeatureCollection<G>["features"] = [];
  const seen = new Set<string>();
  let offset = 0;
  let responseBytes = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const queryUrl = new URL(`${serviceUrl.replace(/\/$/, "")}/query`);
    queryUrl.searchParams.set("where", where);
    queryUrl.searchParams.set(
      "geometry",
      `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
    );
    queryUrl.searchParams.set("geometryType", "esriGeometryEnvelope");
    queryUrl.searchParams.set("spatialRel", "esriSpatialRelIntersects");
    if (distanceMetres !== undefined) {
      queryUrl.searchParams.set("distance", String(distanceMetres));
      queryUrl.searchParams.set("units", "esriSRUnit_Meter");
    }
    queryUrl.searchParams.set("inSR", "4326");
    queryUrl.searchParams.set("outSR", "4326");
    queryUrl.searchParams.set("outFields", outFields.join(","));
    queryUrl.searchParams.set("returnGeometry", "true");
    queryUrl.searchParams.set("resultRecordCount", String(PAGE_SIZE));
    queryUrl.searchParams.set("resultOffset", String(offset));
    queryUrl.searchParams.set("orderByFields", orderByFields);
    queryUrl.searchParams.set("f", "geojson");

    const response = await fetch(queryUrl.toString(), { signal });
    if (!response.ok) {
      throw new Error(`ArcGIS feature query failed (${response.status})`);
    }

    let data: unknown;
    if (responseLimitBytes !== undefined) {
      if (Number(response.headers.get("content-length")) + responseBytes > responseLimitBytes) throw new ArcGISFeatureSizeError("ArcGIS response exceeded the size limit");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("ArcGIS response is unreadable");
      const chunks: Uint8Array[] = [];
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          responseBytes += value.byteLength;
          if (responseBytes > responseLimitBytes) { await reader.cancel(); throw new ArcGISFeatureSizeError("ArcGIS response exceeded the size limit"); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      signal?.throwIfAborted();
      data = JSON.parse(await new Blob(chunks as BlobPart[]).text());
    } else data = await response.json();
    const pageCollection = data as ArcGISFeatureCollection<G> & {
        exceededTransferLimit?: boolean;
        properties?: { exceededTransferLimit?: boolean };
      };
    if (!Array.isArray(pageCollection.features)) {
      throw new Error("ArcGIS feature query returned an invalid collection");
    }

    for (const feature of pageCollection.features) {
      const key = featureKey(feature, idField);
      if (!seen.has(key)) {
        seen.add(key);
        features.push(feature);
      }
    }

    const limited = pageCollection.exceededTransferLimit === true ||
      pageCollection.properties?.exceededTransferLimit === true;
    if (limited && pageCollection.features.length === 0) {
      throw new Error("ArcGIS returned an incomplete empty page");
    }
    if (!limited && pageCollection.features.length < PAGE_SIZE) {
      return { type: "FeatureCollection", features };
    }
    offset += pageCollection.features.length;
  }

  throw new Error("ArcGIS feature query exceeded the overlay safety limit");
}
