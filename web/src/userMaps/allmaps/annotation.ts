import type { Gcp, GeoreferenceMethod, UserMapRecord } from "../types";

/**
 * The two transformation shapes a IIIF Georeference Annotation body can
 * carry, restricted to what this app ever solves. `thinPlateSpline` takes
 * no `options` — Allmaps' other transformations (e.g. `polynomial` of order
 * 2 or 3) do, but this app never fits one, so the wider spec shape is not
 * modelled here.
 */
type AnnotationTransformation =
  | { type: "thinPlateSpline" }
  | { type: "polynomial"; options: { order: 1 } };

/**
 * One control point, in the GeoJSON Feature shape the extension requires.
 * `resourceCoords` (pixel `[x, y]`) and `geometry.coordinates` (`[lon, lat]`)
 * are OPPOSITE orders — see `featureFor` below, which is the one place that
 * distinction has to be gotten right.
 */
type AnnotationFeature = {
  type: "Feature";
  properties: { resourceCoords: [number, number] };
  geometry: { type: "Point"; coordinates: [number, number] };
};

/**
 * A IIIF Georeference Annotation (<https://iiif.io/api/extension/georef/>),
 * hand-written rather than built with `@allmaps/annotation` — see the PR 3
 * plan's Global Constraints for why that package can't be a dependency here.
 */
export type GeoreferenceAnnotation = {
  "@context": string[];
  type: "Annotation";
  motivation: "georeferencing";
  /**
   * Our maps are local files in IndexedDB with no IIIF Image Service or
   * public URL, and the extension has no provision for that case — it
   * requires `target` to be a full IIIF resource or a region within one. A
   * `urn:uuid:` placeholder keeps the annotation well-formed and carries the
   * whole payload; a user who later publishes the scan can retarget it by
   * editing this one field. `width`/`height` are the record's ORIGINAL
   * `pixelSize`, never a preview dimension — the same rule that governs
   * `Gcp.pixel` throughout this module.
   */
  target: { type: "Canvas"; id: string; width: number; height: number };
  body: {
    type: "FeatureCollection";
    /**
     * On the body, NOT the annotation root. Placing it at the root produces
     * an annotation that parses as JSON but is silently invalid against the
     * extension.
     */
    transformation: AnnotationTransformation;
    features: AnnotationFeature[];
  };
};

/** The two IIIF contexts a Georeference Annotation must declare, in order. */
const GEOREF_ANNOTATION_CONTEXT = [
  "http://iiif.io/api/presentation/3/context.json",
  "http://iiif.io/api/extension/georef/1/context.json",
];

function transformationFor(method: GeoreferenceMethod): AnnotationTransformation {
  return method === "tps"
    ? { type: "thinPlateSpline" }
    : { type: "polynomial", options: { order: 1 } };
}

/**
 * `pixel` is `[x, y]`; `map` becomes GeoJSON `coordinates`, which is
 * `[lon, lat]` — the OPPOSITE order from `resourceCoords`. Both are plain
 * number pairs, so getting this backwards type-checks and still produces
 * valid-looking (wrong) JSON.
 */
function featureFor(gcp: Gcp): AnnotationFeature {
  return {
    type: "Feature",
    properties: { resourceCoords: [gcp.pixel.x, gcp.pixel.y] },
    geometry: { type: "Point", coordinates: [gcp.map.lng, gcp.map.lat] },
  };
}

/**
 * Serializes a record's GCPs as a IIIF Georeference Annotation — the format
 * Allmaps uses, so the georeferencing work done in this app can leave it.
 * Returns null for an embedded-georeference raster (GeoTIFF tiepoints),
 * which has no GCPs to serialize.
 */
export function georeferenceAnnotation(
  record: UserMapRecord,
): GeoreferenceAnnotation | null {
  if (record.georef.kind !== "gcp") {
    return null;
  }
  const { gcps, method } = record.georef;
  return {
    "@context": GEOREF_ANNOTATION_CONTEXT,
    type: "Annotation",
    motivation: "georeferencing",
    target: {
      type: "Canvas",
      id: `urn:uuid:${record.id}`,
      width: record.pixelSize.width,
      height: record.pixelSize.height,
    },
    body: {
      type: "FeatureCollection",
      transformation: transformationFor(method),
      features: gcps.map(featureFor),
    },
  };
}
