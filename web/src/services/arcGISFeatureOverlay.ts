export type MapEnvelope = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type ArcGISPointFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  Record<string, unknown>
>;

type FetchArcGISFeatureOverlayOptions = {
  serviceUrl: string;
  bounds: MapEnvelope;
  outFields: readonly string[];
  distanceMetres?: number;
  signal?: AbortSignal;
};

const PAGE_SIZE = 2_000;
const MAX_PAGES = 10;

function featureKey(
  feature: ArcGISPointFeatureCollection["features"][number],
): string {
  const geoId = feature.properties.geo_id;
  return String(feature.id ?? geoId ?? JSON.stringify(feature.geometry));
}

export async function fetchArcGISFeatureOverlay({
  serviceUrl,
  bounds,
  outFields,
  distanceMetres,
  signal,
}: FetchArcGISFeatureOverlayOptions): Promise<ArcGISPointFeatureCollection> {
  const features: ArcGISPointFeatureCollection["features"] = [];
  const seen = new Set<string>();

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const queryUrl = new URL(`${serviceUrl.replace(/\/$/, "")}/query`);
    queryUrl.searchParams.set("where", "1=1");
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
    queryUrl.searchParams.set("orderByFields", "geo_id");
    queryUrl.searchParams.set("f", "geojson");

    const response = await fetch(queryUrl.toString(), { signal });
    if (!response.ok) {
      throw new Error(`ArcGIS feature query failed (${response.status})`);
    }

    const pageCollection =
      (await response.json()) as ArcGISPointFeatureCollection;
    if (!Array.isArray(pageCollection.features)) {
      throw new Error("ArcGIS feature query returned an invalid collection");
    }

    for (const feature of pageCollection.features) {
      const key = featureKey(feature);
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
