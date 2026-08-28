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
};

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
}: FetchArcGISFeatureOverlayOptions): Promise<ArcGISFeatureCollection<G>> {
  const features: ArcGISFeatureCollection<G>["features"] = [];
  const seen = new Set<string>();

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
    queryUrl.searchParams.set("resultOffset", String(page * PAGE_SIZE));
    queryUrl.searchParams.set("orderByFields", orderByFields);
    queryUrl.searchParams.set("f", "geojson");

    const response = await fetch(queryUrl.toString(), { signal });
    if (!response.ok) {
      throw new Error(`ArcGIS feature query failed (${response.status})`);
    }

    const pageCollection =
      (await response.json()) as ArcGISFeatureCollection<G>;
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

    if (pageCollection.features.length < PAGE_SIZE) {
      return { type: "FeatureCollection", features };
    }
  }

  throw new Error("ArcGIS feature query exceeded the overlay safety limit");
}
