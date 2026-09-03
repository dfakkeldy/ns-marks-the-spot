import type { NsprdFeatureCollection } from "./nsprd";

type ParcelFeature = NsprdFeatureCollection["features"][number];
type RiverAepIntersection = {
  annualExceedanceProbabilityPercent: 1 | 5;
  relationship: "area" | "boundary";
  places: string[];
};

type Bounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

type RiverLayer = {
  id: number;
  annualExceedanceProbabilityPercent: 1 | 5;
  relationship: "area" | "boundary";
  place: string;
  extent: Bounds;
};

export type PublishedRiverFloodEvidence =
  | {
      status: "published-intersection";
      aep: RiverAepIntersection[];
    }
  | { status: "within-published-layer-extent"; aep: [] }
  | { status: "outside-published-layer-extents"; aep: [] }
  | { status: "error"; aep: []; message: string };

export type RasterSampleSummary = {
  sampledParcelPixels: number;
  floodedParcelPixels: number;
  approximateAffectedPercent: number;
  approximateAffectedSquareMetres: number | null;
};

export type CoastalScenario = "current" | "2050" | "2100";

export type CoastalFloodEvidence =
  | {
      scenario: CoastalScenario;
      status: "intersects" | "no-intersection";
      stormAnnualExceedanceProbabilityPercent: 1;
      approximateAffectedPercent: number;
      approximateAffectedSquareMetres: number | null;
      sampledParcelPixels: number;
    }
  /**
   * The scenario raster came back, but no pixel centre landed inside the
   * parcel outline, so nothing was measured. It carries no percent and no
   * area: reporting 0% would turn a failure to sample into a finding that the
   * scenario misses the lot. iOS keeps the same state
   * (`CoastalFloodEvidence.Summary.wasSampled`).
   */
  | {
      scenario: CoastalScenario;
      status: "not-sampled";
      stormAnnualExceedanceProbabilityPercent: 1;
      sampledParcelPixels: 0;
    }
  /** No usable outline to sample against, so no scenario was asked at all. */
  | {
      scenario: CoastalScenario;
      status: "geometry-unavailable";
      stormAnnualExceedanceProbabilityPercent: 1;
    }
  | {
      scenario: CoastalScenario;
      status: "error";
      stormAnnualExceedanceProbabilityPercent: 1;
      message: string;
    };

export type ParcelFloodHazardEvidence = {
  river: PublishedRiverFloodEvidence;
  coastal: CoastalFloodEvidence[];
};

type DecodedRaster = {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
};

type RasterDecoder = (blob: Blob) => Promise<DecodedRaster>;

const RIVER_SERVICE_URL =
  "https://fletcher.novascotia.ca/arcgis/rest/services/mrlu/flood_risk_areas/MapServer";

const riverLayers: readonly RiverLayer[] = [
  { id: 3, annualExceedanceProbabilityPercent: 5, relationship: "area", place: "Antigonish", extent: { west: -62.0296298689, south: 45.6114622688, east: -61.9589348555, north: 45.6401819156 } },
  { id: 5, annualExceedanceProbabilityPercent: 1, relationship: "area", place: "Antigonish", extent: { west: -62.0296298689, south: 45.6114622688, east: -61.9589348555, north: 45.6401819156 } },
  { id: 8, annualExceedanceProbabilityPercent: 5, relationship: "area", place: "Bedford / Sackville", extent: { west: -63.7670749334, south: 44.730325235, east: -63.6536740292, north: 44.7991976903 } },
  { id: 10, annualExceedanceProbabilityPercent: 1, relationship: "area", place: "Bedford / Sackville", extent: { west: -63.7670749334, south: 44.730325235, east: -63.6536740292, north: 44.7991976903 } },
  { id: 12, annualExceedanceProbabilityPercent: 5, relationship: "boundary", place: "Pictou", extent: { west: -62.6782668256, south: 45.5052687523, east: -62.6391172242, north: 45.5917443499 } },
  { id: 14, annualExceedanceProbabilityPercent: 1, relationship: "area", place: "Pictou", extent: { west: -62.6782668256, south: 45.5052687523, east: -62.6391172242, north: 45.5917443499 } },
  { id: 16, annualExceedanceProbabilityPercent: 5, relationship: "boundary", place: "Truro", extent: { west: -63.355277766, south: 45.3559706473, east: -63.1671033846, north: 45.4412598116 } },
  { id: 18, annualExceedanceProbabilityPercent: 1, relationship: "area", place: "Truro", extent: { west: -63.355277766, south: 45.3559706473, east: -63.1671033846, north: 45.4412598116 } },
] as const;

const coastalScenarios: ReadonlyArray<{
  scenario: CoastalScenario;
  serviceUrl: string;
}> = [
  {
    scenario: "current",
    serviceUrl:
      "https://nsgiwa.novascotia.ca/arcgis/rest/services/OCN/OCN_Projected_Current_Day_Flooding_UT83/MapServer",
  },
  {
    scenario: "2050",
    serviceUrl:
      "https://nsgiwa.novascotia.ca/arcgis/rest/services/OCN/OCN_Projected_Worst_Case_Flooding_2050_UT83/MapServer",
  },
  {
    scenario: "2100",
    serviceUrl:
      "https://nsgiwa.novascotia.ca/arcgis/rest/services/OCN/OCN_Projected_Worst_Case_Flooding_2100_UT83/MapServer",
  },
] as const;

function ringsForFeatures(features: readonly ParcelFeature[]): number[][][] {
  return features.flatMap(({ geometry }) => {
    if (geometry.type === "Polygon") {
      return geometry.coordinates.map((ring) => [...ring].reverse());
    }
    if (geometry.type === "MultiPolygon") {
      return geometry.coordinates.flatMap((polygon) =>
        polygon.map((ring) => [...ring].reverse()),
      );
    }
    return [];
  });
}

function boundsForFeatures(features: readonly ParcelFeature[]): Bounds | null {
  const positions = features.flatMap(({ geometry }) => {
    if (geometry.type === "Polygon") return geometry.coordinates.flat();
    if (geometry.type === "MultiPolygon") return geometry.coordinates.flat(2);
    return [];
  });
  if (positions.length === 0) return null;
  return positions.reduce<Bounds>(
    (bounds, [longitude, latitude]) => ({
      west: Math.min(bounds.west, longitude),
      south: Math.min(bounds.south, latitude),
      east: Math.max(bounds.east, longitude),
      north: Math.max(bounds.north, latitude),
    }),
    { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity },
  );
}

function boundsIntersect(left: Bounds, right: Bounds): boolean {
  return !(
    left.east < right.west ||
    left.west > right.east ||
    left.north < right.south ||
    left.south > right.north
  );
}

export async function fetchPublishedRiverFloodEvidence(
  features: readonly ParcelFeature[],
  signal?: AbortSignal,
): Promise<PublishedRiverFloodEvidence> {
  const rings = ringsForFeatures(features);
  const parcelBounds = boundsForFeatures(features);
  if (rings.length === 0 || !parcelBounds) {
    return { status: "outside-published-layer-extents", aep: [] };
  }
  const relevantLayers = riverLayers.filter(({ extent }) =>
    boundsIntersect(parcelBounds, extent),
  );
  if (relevantLayers.length === 0) {
    return { status: "outside-published-layer-extents", aep: [] };
  }

  try {
    const results = await Promise.all(
      relevantLayers.map(async (layer) => {
        const body = new URLSearchParams({
          f: "json",
          where: "1=1",
          geometry: JSON.stringify({
            rings,
            spatialReference: { wkid: 4326 },
          }),
          geometryType: "esriGeometryPolygon",
          inSR: "4326",
          spatialRel: "esriSpatialRelIntersects",
          outFields: "OBJECTID",
          returnGeometry: "false",
        });
        const response = await fetch(`${RIVER_SERVICE_URL}/${layer.id}/query`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
          signal,
        });
        if (!response.ok) {
          throw new Error(`Published river flood request failed with status ${response.status}.`);
        }
        const payload = (await response.json()) as {
          features?: unknown[];
          error?: { message?: string };
        };
        if (payload.error) {
          throw new Error(payload.error.message ?? "Published river flood request failed.");
        }
        return { layer, intersects: (payload.features?.length ?? 0) > 0 };
      }),
    );
    const intersections = results.filter(({ intersects }) => intersects);
    if (intersections.length > 0) {
      const grouped = new Map<string, RiverAepIntersection>();
      for (const { layer } of intersections) {
        const key = `${layer.annualExceedanceProbabilityPercent}:${layer.relationship}`;
        const existing = grouped.get(key);
        if (existing) {
          if (!existing.places.includes(layer.place)) existing.places.push(layer.place);
        } else {
          grouped.set(key, {
            annualExceedanceProbabilityPercent: layer.annualExceedanceProbabilityPercent,
            relationship: layer.relationship,
            places: [layer.place],
          });
        }
      }
      return { status: "published-intersection", aep: [...grouped.values()] };
    }
    return { status: "within-published-layer-extent", aep: [] };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return {
      status: "error",
      aep: [],
      message: error instanceof Error ? error.message : "Published river flood request failed.",
    };
  }
}

function pointInRing(longitude: number, latitude: number, ring: number[][]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [currentLongitude, currentLatitude] = ring[index];
    const [previousLongitude, previousLatitude] = ring[previous];
    const crosses =
      currentLatitude > latitude !== previousLatitude > latitude &&
      longitude <
        ((previousLongitude - currentLongitude) * (latitude - currentLatitude)) /
          (previousLatitude - currentLatitude) +
          currentLongitude;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInFeature(longitude: number, latitude: number, feature: ParcelFeature): boolean {
  if (feature.geometry.type !== "Polygon" && feature.geometry.type !== "MultiPolygon") {
    return false;
  }
  const polygons = feature.geometry.type === "Polygon"
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates;
  return polygons.some(
    ([outer, ...holes]) =>
      pointInRing(longitude, latitude, outer) &&
      !holes.some((hole) => pointInRing(longitude, latitude, hole)),
  );
}

export function summarizeRasterAlpha({
  rgba,
  width,
  height,
  bounds,
  features,
  mappedAreaSquareMetres,
}: {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  bounds: Bounds;
  features: readonly ParcelFeature[];
  mappedAreaSquareMetres: number | null;
}): RasterSampleSummary {
  let sampledParcelPixels = 0;
  let floodedParcelPixels = 0;
  for (let row = 0; row < height; row += 1) {
    const latitude = bounds.north - ((row + 0.5) / height) * (bounds.north - bounds.south);
    for (let column = 0; column < width; column += 1) {
      const longitude = bounds.west + ((column + 0.5) / width) * (bounds.east - bounds.west);
      if (!features.some((feature) => pointInFeature(longitude, latitude, feature))) continue;
      sampledParcelPixels += 1;
      if (rgba[(row * width + column) * 4 + 3] > 0) floodedParcelPixels += 1;
    }
  }
  const approximateAffectedPercent = sampledParcelPixels === 0
    ? 0
    : Math.round((floodedParcelPixels / sampledParcelPixels) * 10_000) / 100;
  return {
    sampledParcelPixels,
    floodedParcelPixels,
    approximateAffectedPercent,
    approximateAffectedSquareMetres: mappedAreaSquareMetres === null
      ? null
      : Math.round(mappedAreaSquareMetres * approximateAffectedPercent) / 100,
  };
}

async function decodeRasterImage(blob: Blob): Promise<DecodedRaster> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error("Coastal flood raster could not be decoded.");
  }
  context.drawImage(bitmap, 0, 0);
  const rgba = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
  bitmap.close();
  return { rgba, width: canvas.width, height: canvas.height };
}

export async function fetchCoastalFloodEvidence(
  features: readonly ParcelFeature[],
  mappedAreaSquareMetres: number | null,
  signal?: AbortSignal,
  decode: RasterDecoder = decodeRasterImage,
): Promise<CoastalFloodEvidence[]> {
  const bounds = boundsForFeatures(features);
  if (!bounds) {
    // Nothing was asked of the province here. Answering "no-intersection"
    // reported a screen that never ran as a scenario that misses the parcel.
    return coastalScenarios.map(({ scenario }) => ({
      scenario,
      status: "geometry-unavailable",
      stormAnnualExceedanceProbabilityPercent: 1,
    }));
  }
  const width = 384;
  const latitudeSpan = Math.max(bounds.north - bounds.south, 0.00001);
  const longitudeSpan = Math.max(bounds.east - bounds.west, 0.00001);
  const height = Math.max(1, Math.round(width * (latitudeSpan / longitudeSpan)));
  const imageHeight = Math.min(384, height);

  return Promise.all(
    coastalScenarios.map(async ({ scenario, serviceUrl }): Promise<CoastalFloodEvidence> => {
      try {
        const query = new URLSearchParams({
          f: "image",
          bbox: [bounds.west, bounds.south, bounds.east, bounds.north].join(","),
          bboxSR: "4326",
          imageSR: "4326",
          size: `${width},${imageHeight}`,
          format: "png32",
          transparent: "true",
        });
        const response = await fetch(`${serviceUrl}/export?${query}`, { signal });
        if (!response.ok) {
          throw new Error(`Coastal flood request failed with status ${response.status}.`);
        }
        const decoded = await decode(await response.blob());
        const summary = summarizeRasterAlpha({
          ...decoded,
          bounds,
          features,
          mappedAreaSquareMetres,
        });
        if (summary.sampledParcelPixels === 0) {
          return {
            scenario,
            status: "not-sampled",
            stormAnnualExceedanceProbabilityPercent: 1,
            sampledParcelPixels: 0,
          };
        }
        return {
          scenario,
          status: summary.floodedParcelPixels > 0 ? "intersects" : "no-intersection",
          stormAnnualExceedanceProbabilityPercent: 1,
          approximateAffectedPercent: summary.approximateAffectedPercent,
          approximateAffectedSquareMetres: summary.approximateAffectedSquareMetres,
          sampledParcelPixels: summary.sampledParcelPixels,
        };
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        return {
          scenario,
          status: "error",
          stormAnnualExceedanceProbabilityPercent: 1,
          message: error instanceof Error ? error.message : "Coastal flood request failed.",
        };
      }
    }),
  );
}

export async function fetchParcelFloodHazardEvidence(
  features: readonly ParcelFeature[],
  mappedAreaSquareMetres: number | null,
  signal?: AbortSignal,
): Promise<ParcelFloodHazardEvidence> {
  const [river, coastal] = await Promise.all([
    fetchPublishedRiverFloodEvidence(features, signal),
    fetchCoastalFloodEvidence(features, mappedAreaSquareMetres, signal),
  ]);
  return { river, coastal };
}

export { boundsForFeatures };
